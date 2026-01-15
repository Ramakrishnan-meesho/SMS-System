package com.meesho.sms_sender.service;

import com.meesho.sms_sender.dto.SendSmsRequest;
import com.meesho.sms_sender.dto.SendSmsResponse;
import com.meesho.sms_sender.dto.SmsEvent;
import com.meesho.sms_sender.exception.UserBlockedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * Service for handling SMS sending flow:
 * 1. Validates request
 * 2. Checks block list
 * 3. Mocks third-party SMS API call
 * 4. Creates and sends SMS event to Kafka
 * 5. Returns response with request ID and status
 */
@Service
public class SmsService {

    private static final Logger logger = LoggerFactory.getLogger(SmsService.class);

    private final BlockListService blockListService;
    private final KafkaProducerService kafkaProducerService;

    public SmsService(BlockListService blockListService, KafkaProducerService kafkaProducerService) {
        this.blockListService = blockListService;
        this.kafkaProducerService = kafkaProducerService;
    }

    /**
     * Sends an SMS by orchestrating the complete flow:
     * validation, block list check, mock API call, and Kafka event publishing.
     *
     * @param request The SMS send request containing phoneNumber and message
     * @return SendSmsResponse with requestId, status, and timestamp
     * @throws UserBlockedException if user is blocked
     * @throws RuntimeException if Kafka send fails
     */
    public SendSmsResponse sendSms(SendSmsRequest request) {
        logger.info("Processing SMS send request for phoneNumber: {}", request.getPhoneNumber());

        // Step 1: Validation is handled by @Valid annotation at controller level
        // Request is already validated when it reaches this method

        // Step 2: Check block list
        // Use phoneNumber as userId for simplicity
        String userId = request.getPhoneNumber();
        if (blockListService.isBlocked(userId)) {
            logger.warn("SMS send blocked for user: {}", userId);
            throw new UserBlockedException(userId);
        }

        // Step 3: Mock third-party SMS API call
        // Randomly return SUCCESS or FAIL (50/50 chance)
        String status = Math.random() > 0.5 ? "SUCCESS" : "FAIL";
        logger.info("Mock SMS API returned status: {} for phoneNumber: {}", status, request.getPhoneNumber());

        // Optional: Add small delay to simulate network call
        try {
            Thread.sleep(50); // 50ms delay
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.warn("Thread interrupted during mock API delay");
        }

        // Step 4: Create SmsEvent
        long timestamp = System.currentTimeMillis();
        SmsEvent smsEvent = new SmsEvent(
            userId,
            request.getPhoneNumber(),
            request.getMessage(),
            status,
            timestamp
        );

        // Step 5: Send to Kafka
        try {
            CompletableFuture<SendResult<String, SmsEvent>> future = kafkaProducerService.sendSmsEvent(smsEvent);
            
            // Handle Kafka send result asynchronously
            future.whenComplete((result, exception) -> {
                if (exception != null) {
                    logger.error("Failed to send SMS event to Kafka: userId={}, error={}", 
                               userId, exception.getMessage(), exception);
                } else {
                    logger.info("SMS event sent to Kafka successfully: userId={}, offset={}", 
                              userId, result.getRecordMetadata().offset());
                }
            });
        } catch (Exception e) {
            logger.error("Error sending SMS event to Kafka: userId={}, error={}", 
                        userId, e.getMessage(), e);
            throw new RuntimeException("Failed to send SMS event to Kafka", e);
        }

        // Step 6: Return response
        String requestId = UUID.randomUUID().toString();
        SendSmsResponse response = new SendSmsResponse(requestId, status, timestamp);
        
        logger.info("SMS send request completed: requestId={}, status={}, phoneNumber={}", 
                   requestId, status, request.getPhoneNumber());
        
        return response;
    }
}
