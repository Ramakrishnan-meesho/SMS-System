package com.meesho.sms_sender.service;

import com.meesho.sms_sender.dto.SendSmsRequest;
import com.meesho.sms_sender.dto.SendSmsResponse;
import com.meesho.sms_sender.dto.SmsEvent;
import com.meesho.sms_sender.exception.UserBlockedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

/**
 * Service for handling SMS sending flow with async processing:
 * 1. Validates request
 * 2. Checks block list
 * 3. Returns immediately with correlation ID
 * 4. Processes third-party SMS API call asynchronously
 * 5. Publishes SMS event to Kafka asynchronously
 * 
 * This service uses async processing to improve response times and throughput.
 */
@Service
public class SmsService {

    private static final Logger logger = LoggerFactory.getLogger(SmsService.class);
    private static final String MDC_CORRELATION_ID = "correlationId";

    private final BlockListService blockListService;
    private final KafkaProducerService kafkaProducerService;
    private final Executor thirdPartyApiExecutor;
    
    @Value("${sms.third-party-api.success-rate:1.0}")
    private double thirdPartyApiSuccessRate; // 1.0 = 100% success, 0.5 = 50% success
    
    @Value("${sms.third-party-api.delay-ms:10}")
    private long thirdPartyApiDelayMs; // Simulated network delay in milliseconds

    public SmsService(
            BlockListService blockListService,
            KafkaProducerService kafkaProducerService,
            @Qualifier("thirdPartyApiExecutor") Executor thirdPartyApiExecutor) {
        this.blockListService = blockListService;
        this.kafkaProducerService = kafkaProducerService;
        this.thirdPartyApiExecutor = thirdPartyApiExecutor;
    }

    /**
     * Sends an SMS by orchestrating the complete flow asynchronously.
     * Returns immediately after validation and Kafka send, processing 3P API call in background.
     *
     * @param request The SMS send request containing phoneNumber and message
     * @return SendSmsResponse with correlationId, status="PENDING", and timestamp
     * @throws UserBlockedException if user is blocked
     */
    public SendSmsResponse sendSms(SendSmsRequest request) {
        String phoneNumber = request.getPhoneNumber();
        logger.info("Processing SMS send request for phoneNumber: {}", phoneNumber);

        // Step 1: Validation is handled by @Valid annotation at controller level
        // Request is already validated when it reaches this method

        // Step 2: Check block list (synchronous - must be done before proceeding)
        if (blockListService.isBlocked(phoneNumber)) {
            logger.warn("SMS send blocked for phoneNumber: {}", phoneNumber);
            throw new UserBlockedException(phoneNumber);
        }

        // Step 3: Generate correlation ID for tracking
        String correlationId = UUID.randomUUID().toString();
        MDC.put(MDC_CORRELATION_ID, correlationId);
        
        long timestamp = System.currentTimeMillis();
        
        // Step 4: Return response immediately with PENDING status
        SendSmsResponse response = new SendSmsResponse(correlationId, "PENDING", timestamp);
        logger.info("SMS request accepted: correlationId={}, phoneNumber={}", correlationId, phoneNumber);

        // Step 5: Process 3P API call and Kafka send asynchronously
        processSmsAsync(correlationId, phoneNumber, request.getMessage(), timestamp);

        MDC.remove(MDC_CORRELATION_ID);
        return response;
    }

    /**
     * Processes SMS sending asynchronously:
     * 1. Calls third-party SMS API (mocked) in separate thread pool
     * 2. Sends event to Kafka after API call completes
     * 3. Handles errors with callbacks
     *
     * @param correlationId Correlation ID for tracking
     * @param phoneNumber Phone number
     * @param message SMS message text
     * @param timestamp Original request timestamp
     */
    private void processSmsAsync(String correlationId, String phoneNumber, String message, long timestamp) {
        // Set correlation ID in MDC for async operations
        MDC.put(MDC_CORRELATION_ID, correlationId);

        // Step 1: Call third-party API asynchronously
        CompletableFuture<String> apiStatusFuture = CompletableFuture.supplyAsync(() -> {
            try {
                MDC.put(MDC_CORRELATION_ID, correlationId);
                logger.info("Calling third-party SMS API: correlationId={}, phoneNumber={}", 
                           correlationId, phoneNumber);
                
                // Mock third-party SMS API call
                // Configurable success rate (default: 100% success for better UX)
                // Set sms.third-party-api.success-rate=0.5 for 50% success rate (testing)
                String status = Math.random() < thirdPartyApiSuccessRate ? "SUCCESS" : "FAIL";
                
                // Simulate network delay (configurable, default: 10ms for faster processing)
                Thread.sleep(thirdPartyApiDelayMs);
                
                logger.info("Third-party API response: correlationId={}, status={}", correlationId, status);
                return status;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                logger.error("Third-party API call interrupted: correlationId={}", correlationId, e);
                return "FAIL";
            } catch (Exception e) {
                logger.error("Third-party API call failed: correlationId={}, error={}", 
                           correlationId, e.getMessage(), e);
                return "FAIL";
            } finally {
                MDC.remove(MDC_CORRELATION_ID);
            }
        }, thirdPartyApiExecutor);

        // Step 2: After API call completes, send to Kafka and handle result
        apiStatusFuture.thenAcceptAsync(status -> {
            try {
                MDC.put(MDC_CORRELATION_ID, correlationId);
                logger.info("Preparing to send SMS event to Kafka: correlationId={}, status={}", 
                           correlationId, status);

                // Create SmsEvent with correlation ID
                SmsEvent smsEvent = new SmsEvent(
                    correlationId,
                    phoneNumber,
                    message,
                    status,
                    timestamp
                );

                // Send to Kafka
                CompletableFuture<SendResult<String, SmsEvent>> kafkaFuture = 
                    kafkaProducerService.sendSmsEvent(smsEvent);

                // Handle Kafka send result with callbacks
                kafkaFuture.whenComplete((result, exception) -> {
                    if (exception != null) {
                        logger.error("Failed to send SMS event to Kafka: correlationId={}, phoneNumber={}, " +
                                   "status={}, error={}", 
                                   correlationId, phoneNumber, status, exception.getMessage(), exception);
                        handleAsyncError(correlationId, phoneNumber, exception);
                    } else {
                        logger.info("SMS event sent to Kafka successfully: correlationId={}, phoneNumber={}, " +
                                   "status={}, offset={}, partition={}", 
                                   correlationId, phoneNumber, status,
                                   result.getRecordMetadata().offset(),
                                   result.getRecordMetadata().partition());
                    }
                });

            } catch (Exception e) {
                logger.error("Error in async SMS processing: correlationId={}, phoneNumber={}, error={}", 
                           correlationId, phoneNumber, e.getMessage(), e);
                handleAsyncError(correlationId, phoneNumber, e);
            } finally {
                MDC.remove(MDC_CORRELATION_ID);
            }
        }, thirdPartyApiExecutor).exceptionally(throwable -> {
            logger.error("Async processing failed: correlationId={}, phoneNumber={}, error={}", 
                        correlationId, phoneNumber, throwable.getMessage(), throwable);
            handleAsyncError(correlationId, phoneNumber, throwable);
            return null;
        });
    }


    /**
     * Handles async processing errors.
     *
     * @param correlationId Correlation ID
     * @param phoneNumber Phone number
     * @param error Error that occurred
     */
    private void handleAsyncError(String correlationId, String phoneNumber, Throwable error) {
        logger.error("Async SMS processing error: correlationId={}, phoneNumber={}, error={}", 
                    correlationId, phoneNumber, error.getMessage(), error);
        
        // In production, you might want to:
        // 1. Send to DLQ
        // 2. Update status in database
        // 3. Send notification to monitoring system
        // 4. Retry with exponential backoff
    }
}
