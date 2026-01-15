package com.meesho.sms_sender.service;

import com.meesho.sms_sender.config.KafkaConfig;
import com.meesho.sms_sender.dto.SmsEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.concurrent.CompletableFuture;

/**
 * Service for publishing SMS events to Kafka.
 * Sends events to the 'sms-events' topic for consumption by the Go SMS Store service.
 */
@Service
public class KafkaProducerService {

    private static final Logger logger = LoggerFactory.getLogger(KafkaProducerService.class);
    private static final String TOPIC_NAME = KafkaConfig.SMS_EVENTS_TOPIC;

    private final KafkaTemplate<String, SmsEvent> kafkaTemplate;

    public KafkaProducerService(KafkaTemplate<String, SmsEvent> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    /**
     * Sends an SMS event to Kafka topic.
     * 
     * @param event The SMS event to send
     * @return CompletableFuture with SendResult for async handling
     * @throws RuntimeException if sending fails
     */
    public CompletableFuture<SendResult<String, SmsEvent>> sendSmsEvent(SmsEvent event) {
        if (event == null) {
            throw new IllegalArgumentException("SMS event cannot be null");
        }

        logger.info("Sending SMS event to Kafka topic '{}': correlationId={}, phoneNumber={}, status={}", 
                   TOPIC_NAME, event.getCorrelationId(), event.getPhoneNumber(), event.getStatus());

        try {
            // Send event to Kafka topic
            // Using phoneNumber as the key for partitioning (messages with same phoneNumber go to same partition)
            CompletableFuture<SendResult<String, SmsEvent>> future = 
                kafkaTemplate.send(TOPIC_NAME, event.getPhoneNumber(), event);

            // Handle success and failure asynchronously
            future.whenComplete((result, exception) -> {
                if (exception == null) {
                    logger.info("Successfully sent SMS event to Kafka: correlationId={}, phoneNumber={}, offset={}", 
                               event.getCorrelationId(), event.getPhoneNumber(), 
                               result.getRecordMetadata().offset());
                } else {
                    logger.error("Failed to send SMS event to Kafka: correlationId={}, phoneNumber={}, error={}", 
                               event.getCorrelationId(), event.getPhoneNumber(), exception.getMessage(), exception);
                }
            });

            return future;
        } catch (Exception e) {
            logger.error("Error sending SMS event to Kafka: correlationId={}, phoneNumber={}, error={}", 
                        event.getCorrelationId(), event.getPhoneNumber(), e.getMessage(), e);
            throw new RuntimeException("Failed to send SMS event to Kafka", e);
        }
    }
}
