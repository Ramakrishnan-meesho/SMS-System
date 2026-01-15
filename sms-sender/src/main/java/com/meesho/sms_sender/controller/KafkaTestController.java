package com.meesho.sms_sender.controller;

import com.meesho.sms_sender.dto.SmsEvent;
import com.meesho.sms_sender.service.KafkaProducerService;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.support.SendResult;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Test controller for Kafka producer functionality.
 * This endpoint helps verify that Kafka integration is working correctly.
 * Can be removed or secured in production.
 */
@RestController
@RequestMapping("/v1/kafka")
public class KafkaTestController {

    private final KafkaProducerService kafkaProducerService;

    public KafkaTestController(KafkaProducerService kafkaProducerService) {
        this.kafkaProducerService = kafkaProducerService;
    }

    /**
     * Test endpoint to send a sample SMS event to Kafka.
     * POST /v1/kafka/test
     */
    @PostMapping("/test")
    public ResponseEntity<Map<String, Object>> testKafkaProducer(
            @RequestParam(required = false, defaultValue = "1234567890") String phoneNumber,
            @RequestParam(required = false, defaultValue = "Test SMS message") String message,
            @RequestParam(required = false, defaultValue = "SUCCESS") String status) {

        // Create test SMS event
        String correlationId = java.util.UUID.randomUUID().toString();
        SmsEvent event = new SmsEvent();
        event.setCorrelationId(correlationId);
        event.setPhoneNumber(phoneNumber);
        event.setText(message);
        event.setStatus(status);
        event.setTimestamp(System.currentTimeMillis());

        try {
            // Send to Kafka
            CompletableFuture<SendResult<String, SmsEvent>> future = kafkaProducerService.sendSmsEvent(event);
            
            // Wait for the result (with timeout) to catch immediate errors
            try {
                SendResult<String, SmsEvent> result = future.get();
                return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "SMS event sent to Kafka successfully",
                    "event", event,
                    "offset", result.getRecordMetadata().offset()
                ));
            } catch (Exception e) {
                return ResponseEntity.status(500).body(Map.of(
                    "success", false,
                    "message", "Failed to send SMS event to Kafka",
                    "error", e.getCause() != null ? e.getCause().getMessage() : e.getMessage(),
                    "details", "Check if Kafka is running: docker ps | grep kafka"
                ));
            }
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of(
                "success", false,
                "message", "Failed to send SMS event to Kafka",
                "error", e.getMessage(),
                "details", "Check if Kafka is running: docker ps | grep kafka"
            ));
        }
    }
}
