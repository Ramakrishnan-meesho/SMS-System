package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/IBM/sarama"
	"sms-store/internal/models"
	"sms-store/internal/store"
)

// Consumer represents a Kafka consumer for SMS events with worker pool and batch processing.
type Consumer struct {
	consumerGroup sarama.ConsumerGroup
	store         store.Store
	topic         string
	ctx           context.Context
	cancel        context.CancelFunc
	wg            sync.WaitGroup
	
	// Worker pool configuration
	workerPoolSize int
	batchSize      int
	batchTimeout   time.Duration
}

// ConsumerConfig holds configuration for the consumer.
type ConsumerConfig struct {
	WorkerPoolSize int           // Number of concurrent workers per partition
	BatchSize      int           // Number of messages to batch before writing
	BatchTimeout   time.Duration // Maximum time to wait before flushing batch
}

// DefaultConsumerConfig returns default configuration values.
func DefaultConsumerConfig() ConsumerConfig {
	return ConsumerConfig{
		WorkerPoolSize: 5,                // 5 workers per partition
		BatchSize:      5,                 // Batch 5 messages (reduced for faster flushing)
		BatchTimeout:   200 * time.Millisecond, // Flush every 200ms (reduced from 2s for better responsiveness)
	}
}

// NewConsumer creates a new Kafka consumer instance with optimized configuration.
// It connects to Kafka and subscribes to the specified topic.
func NewConsumer(brokers []string, groupID string, topic string, store store.Store) (*Consumer, error) {
	return NewConsumerWithConfig(brokers, groupID, topic, store, DefaultConsumerConfig())
}

// NewConsumerWithConfig creates a new Kafka consumer with custom configuration.
func NewConsumerWithConfig(brokers []string, groupID string, topic string, store store.Store, config ConsumerConfig) (*Consumer, error) {
	if len(brokers) == 0 {
		brokers = []string{"localhost:9092"}
	}
	if groupID == "" {
		groupID = "sms-store-consumer-group"
	}
	if topic == "" {
		topic = "sms-events"
	}

	// Create consumer group config with optimizations
	cfg := sarama.NewConfig()
	cfg.Version = sarama.V2_8_0_0 // Use a stable Kafka version
	cfg.Consumer.Group.Rebalance.Strategy = sarama.NewBalanceStrategyRoundRobin()
	cfg.Consumer.Offsets.Initial = sarama.OffsetOldest // Start from beginning if no offset
	cfg.Consumer.Return.Errors = true

	// Enable compression support (gzip, snappy, lz4, zstd)
	// Consumer automatically handles decompression based on producer's compression type
	cfg.Consumer.Fetch.Min = 1                    // Minimum bytes to fetch
	cfg.Consumer.Fetch.Default = 1024 * 1024      // 1MB default fetch size for better throughput
	cfg.Consumer.Fetch.Max = 10 * 1024 * 1024     // 10MB max fetch size

	// Optimize consumer group settings
	cfg.Consumer.Group.Session.Timeout = 10 * time.Second
	cfg.Consumer.Group.Heartbeat.Interval = 3 * time.Second
	cfg.Consumer.MaxProcessingTime = 30 * time.Second

	// Create consumer group
	consumerGroup, err := sarama.NewConsumerGroup(brokers, groupID, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create consumer group: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Consumer{
		consumerGroup:  consumerGroup,
		store:          store,
		topic:          topic,
		ctx:            ctx,
		cancel:         cancel,
		workerPoolSize: config.WorkerPoolSize,
		batchSize:      config.BatchSize,
		batchTimeout:   config.BatchTimeout,
	}, nil
}

// Start begins consuming messages from Kafka.
// It runs in a goroutine and processes messages asynchronously.
func (c *Consumer) Start() error {
	log.Println("Starting Kafka consumer...")
	log.Printf("Topic: %s", c.topic)
	log.Printf("Worker pool size: %d, Batch size: %d, Batch timeout: %v", 
		c.workerPoolSize, c.batchSize, c.batchTimeout)

	c.wg.Add(2)

	// Start consuming messages
	go func() {
		defer c.wg.Done()
		for {
			// Check if context is cancelled
			if c.ctx.Err() != nil {
				return
			}

			// Consume messages with optimized handler
			handler := newConsumerGroupHandler(c.store, c.workerPoolSize, c.batchSize, c.batchTimeout)
			err := c.consumerGroup.Consume(c.ctx, []string{c.topic}, handler)
			if err != nil {
				log.Printf("Error consuming messages: %v", err)
				// Wait a bit before retrying
				time.Sleep(5 * time.Second)
				continue
			}
		}
	}()

	// Handle errors
	go func() {
		defer c.wg.Done()
		for err := range c.consumerGroup.Errors() {
			log.Printf("Kafka consumer error: %v", err)
		}
	}()

	log.Println("Kafka consumer started successfully")
	return nil
}

// Stop gracefully stops the consumer.
func (c *Consumer) Stop() error {
	log.Println("Stopping Kafka consumer...")
	c.cancel()
	c.wg.Wait()

	if err := c.consumerGroup.Close(); err != nil {
		return fmt.Errorf("error closing consumer group: %w", err)
	}

	log.Println("Kafka consumer stopped")
	return nil
}

// consumerGroupHandler implements sarama.ConsumerGroupHandler interface
// with worker pool and batch processing.
type consumerGroupHandler struct {
	store          store.Store
	workerPoolSize int
	batchSize      int
	batchTimeout   time.Duration
}

// newConsumerGroupHandler creates a new handler with worker pool and batch processing.
func newConsumerGroupHandler(store store.Store, workerPoolSize, batchSize int, batchTimeout time.Duration) *consumerGroupHandler {
	return &consumerGroupHandler{
		store:          store,
		workerPoolSize: workerPoolSize,
		batchSize:      batchSize,
		batchTimeout:   batchTimeout,
	}
}

// Setup is called when the consumer group session is being set up.
func (h *consumerGroupHandler) Setup(sarama.ConsumerGroupSession) error {
	return nil
}

// Cleanup is called when the consumer group session is ending.
func (h *consumerGroupHandler) Cleanup(sarama.ConsumerGroupSession) error {
	return nil
}

// ConsumeClaim processes messages from a partition using worker pool and batch processing.
func (h *consumerGroupHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	// Create worker pool for concurrent message processing
	workerPool := make(chan struct{}, h.workerPoolSize)
	var wg sync.WaitGroup

	// Batch processing channel
	batchChan := make(chan *sarama.ConsumerMessage, h.batchSize*2)
	batchProcessor := newBatchProcessor(h.store, h.batchSize, h.batchTimeout)

	// Start batch processor
	batchProcessor.Start(batchChan, &wg)

	// Process messages concurrently
	for {
		select {
		case message := <-claim.Messages():
			if message == nil {
				// Close batch channel and wait for batch processor to finish
				close(batchChan)
				wg.Wait()
				return nil
			}

			// Acquire worker from pool
			workerPool <- struct{}{}
			wg.Add(1)

			// Process message in worker goroutine
			go func(msg *sarama.ConsumerMessage) {
				defer func() {
					<-workerPool // Release worker
					wg.Done()
				}()

				// Send to batch processor (parsing happens in batch processor)
				select {
				case batchChan <- msg:
					// Message queued for batch processing
				case <-session.Context().Done():
					return
				}

				// Mark message as processed
				session.MarkMessage(msg, "")

			}(message)

		case <-session.Context().Done():
			// Close batch channel and wait for all workers to finish
			close(batchChan)
			wg.Wait()
			return nil
		}
	}
}


// batchProcessor handles batch processing of messages for efficient MongoDB writes.
type batchProcessor struct {
	store        store.Store
	batchSize    int
	batchTimeout time.Duration
}

// newBatchProcessor creates a new batch processor.
func newBatchProcessor(store store.Store, batchSize int, batchTimeout time.Duration) *batchProcessor {
	return &batchProcessor{
		store:        store,
		batchSize:    batchSize,
		batchTimeout: batchTimeout,
	}
}

// Start begins batch processing messages.
func (bp *batchProcessor) Start(messageChan <-chan *sarama.ConsumerMessage, wg *sync.WaitGroup) {
	wg.Add(1)
	go func() {
		defer wg.Done()

		batch := make([]models.Message, 0, bp.batchSize)
		ticker := time.NewTicker(bp.batchTimeout)
		defer ticker.Stop()

		flush := func() {
			if len(batch) > 0 {
				if err := bp.flushBatch(batch); err != nil {
					log.Printf("Error flushing batch: %v", err)
				}
				batch = batch[:0] // Reset batch
			}
		}

		for {
			select {
			case msg, ok := <-messageChan:
				if !ok {
					// Channel closed, flush remaining messages
					flush()
					return
				}

				// Parse message
				parsedMsg, err := parseKafkaMessage(msg.Value)
				if err != nil {
					log.Printf("Error parsing message in batch processor: %v", err)
					continue
				}

				batch = append(batch, *parsedMsg)

				// Flush if batch is full
				if len(batch) >= bp.batchSize {
					flush()
					ticker.Reset(bp.batchTimeout)
				}

			case <-ticker.C:
				// Flush on timeout
				flush()
			}
		}
	}()
}

// flushBatch writes a batch of messages to MongoDB.
func (bp *batchProcessor) flushBatch(messages []models.Message) error {
	if len(messages) == 0 {
		return nil
	}

	start := time.Now()
	count, err := bp.store.SaveBatch(messages)
	duration := time.Since(start)

	if err != nil {
		return fmt.Errorf("failed to save batch: %w", err)
	}

	log.Printf("Saved batch of %d messages to MongoDB in %v", count, duration)
	return nil
}

// parseKafkaMessage parses a Kafka message value into a Message struct.
func parseKafkaMessage(data []byte) (*models.Message, error) {
	var smsEvent struct {
		CorrelationID string `json:"correlationId"`
		PhoneNumber   string `json:"phoneNumber"`
		Text          string `json:"text"`
		Status        string `json:"status"`
		Timestamp     int64  `json:"timestamp"`
	}

	if err := json.Unmarshal(data, &smsEvent); err != nil {
		return nil, fmt.Errorf("failed to unmarshal JSON: %w", err)
	}

	// Validate required fields
	if smsEvent.PhoneNumber == "" {
		return nil, fmt.Errorf("phoneNumber is required")
	}
	if smsEvent.Text == "" {
		return nil, fmt.Errorf("text is required")
	}
	if smsEvent.Status == "" {
		return nil, fmt.Errorf("status is required")
	}

	// Convert timestamp to time.Time
	createdAt := time.Unix(smsEvent.Timestamp/1000, (smsEvent.Timestamp%1000)*1000000)

	// Generate ID
	id := fmt.Sprintf("msg-%s", createdAt.Format("20060102150405.000000000"))

	return &models.Message{
		ID:            id,
		CorrelationID: smsEvent.CorrelationID,
		PhoneNumber:   smsEvent.PhoneNumber,
		Text:          smsEvent.Text,
		Status:        smsEvent.Status,
		CreatedAt:     createdAt,
	}, nil
}
