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

// Consumer represents a Kafka consumer for SMS events.
type Consumer struct {
	consumerGroup sarama.ConsumerGroup
	store         store.Store
	topic         string
	ctx           context.Context
	cancel        context.CancelFunc
	wg            sync.WaitGroup
}

// NewConsumer creates a new Kafka consumer instance.
// It connects to Kafka and subscribes to the specified topic.
func NewConsumer(brokers []string, groupID string, topic string, store store.Store) (*Consumer, error) {
	if len(brokers) == 0 {
		brokers = []string{"localhost:9092"}
	}
	if groupID == "" {
		groupID = "sms-store-consumer-group"
	}
	if topic == "" {
		topic = "sms-events"
	}

	// Create consumer group config
	config := sarama.NewConfig()
	config.Version = sarama.V2_8_0_0 // Use a stable Kafka version
	config.Consumer.Group.Rebalance.Strategy = sarama.NewBalanceStrategyRoundRobin()
	config.Consumer.Offsets.Initial = sarama.OffsetOldest // Start from beginning if no offset
	config.Consumer.Return.Errors = true

	// Create consumer group
	consumerGroup, err := sarama.NewConsumerGroup(brokers, groupID, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create consumer group: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Consumer{
		consumerGroup: consumerGroup,
		store:         store,
		topic:         topic,
		ctx:           ctx,
		cancel:        cancel,
	}, nil
}

// Start begins consuming messages from Kafka.
// It runs in a goroutine and processes messages asynchronously.
func (c *Consumer) Start() error {
	log.Println("Starting Kafka consumer...")
	log.Printf("Topic: %s", c.topic)

	c.wg.Add(2)

	// Start consuming messages
	go func() {
		defer c.wg.Done()
		for {
			// Check if context is cancelled
			if c.ctx.Err() != nil {
				return
			}

			// Consume messages
			handler := &consumerGroupHandler{store: c.store}
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

// consumerGroupHandler implements sarama.ConsumerGroupHandler interface.
type consumerGroupHandler struct {
	store store.Store
}

// Setup is called when the consumer group session is being set up.
func (h *consumerGroupHandler) Setup(sarama.ConsumerGroupSession) error {
	return nil
}

// Cleanup is called when the consumer group session is ending.
func (h *consumerGroupHandler) Cleanup(sarama.ConsumerGroupSession) error {
	return nil
}

// ConsumeClaim processes messages from a partition.
func (h *consumerGroupHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for {
		select {
		case message := <-claim.Messages():
			if message == nil {
				return nil
			}

			// Process the message
			if err := h.processMessage(message.Value); err != nil {
				log.Printf("Error processing message from partition %d, offset %d: %v",
					message.Partition, message.Offset, err)
				// Continue processing other messages even if one fails
				// In production, you might want to send failed messages to a dead letter queue
			} else {
				log.Printf("Successfully processed message: partition=%d, offset=%d",
					message.Partition, message.Offset)
			}

			// Mark message as processed
			session.MarkMessage(message, "")

		case <-session.Context().Done():
			return nil
		}
	}
}

// processMessage deserializes JSON and saves to MongoDB.
func (h *consumerGroupHandler) processMessage(data []byte) error {
	// Parse JSON from Kafka message
	var smsEvent struct {
		UserID      string `json:"userId"`
		PhoneNumber string `json:"phoneNumber"`
		Text        string `json:"text"`
		Status      string `json:"status"`
		Timestamp   int64  `json:"timestamp"`
	}

	if err := json.Unmarshal(data, &smsEvent); err != nil {
		return fmt.Errorf("failed to unmarshal JSON: %w", err)
	}

	// Validate required fields
	if smsEvent.UserID == "" {
		return fmt.Errorf("userId is required")
	}
	if smsEvent.PhoneNumber == "" {
		return fmt.Errorf("phoneNumber is required")
	}
	if smsEvent.Text == "" {
		return fmt.Errorf("text is required")
	}
	if smsEvent.Status == "" {
		return fmt.Errorf("status is required")
	}

	// Convert timestamp to time.Time
	createdAt := time.Unix(smsEvent.Timestamp/1000, (smsEvent.Timestamp%1000)*1000000)

	// Generate ID (using timestamp-based ID similar to handler)
	id := fmt.Sprintf("msg-%s", createdAt.Format("20060102150405.000000000"))

	// Create Message struct
	message := models.Message{
		ID:          id,
		UserID:      smsEvent.UserID,
		PhoneNumber: smsEvent.PhoneNumber,
		Text:        smsEvent.Text,
		Status:      smsEvent.Status,
		CreatedAt:   createdAt,
	}

	// Save to MongoDB
	_, err := h.store.Save(message)
	if err != nil {
		return fmt.Errorf("failed to save message to store: %w", err)
	}

	log.Printf("Saved SMS event to MongoDB: userId=%s, status=%s, id=%s",
		message.UserID, message.Status, message.ID)

	return nil
}
