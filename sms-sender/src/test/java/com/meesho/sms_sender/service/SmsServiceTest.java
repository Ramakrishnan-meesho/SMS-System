package com.meesho.sms_sender.service;

import com.meesho.sms_sender.dto.SendSmsRequest;
import com.meesho.sms_sender.dto.SendSmsResponse;
import com.meesho.sms_sender.dto.SmsEvent;
import com.meesho.sms_sender.exception.UserBlockedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.SendResult;

import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SmsServiceTest {

    @Mock
    private BlockListService blockListService;

    @Mock
    private KafkaProducerService kafkaProducerService;

    @InjectMocks
    private SmsService smsService;

    private SendSmsRequest validRequest;

    @BeforeEach
    void setUp() {
        validRequest = new SendSmsRequest("1234567890", "Hello World");
    }

    @Test
    void testSuccessfulSmsSend() throws Exception {
        // Arrange
        when(blockListService.isBlocked("1234567890")).thenReturn(false);
        
        // Create a successful Kafka future
        CompletableFuture<SendResult<String, SmsEvent>> future = new CompletableFuture<>();
        @SuppressWarnings("unchecked")
        SendResult<String, SmsEvent> sendResult = mock(SendResult.class);
        future.complete(sendResult);
        
        when(kafkaProducerService.sendSmsEvent(any(SmsEvent.class))).thenReturn(future);

        // Act
        SendSmsResponse response = smsService.sendSms(validRequest);

        // Assert
        assertNotNull(response);
        assertNotNull(response.getCorrelationId());
        assertEquals("PENDING", response.getStatus());
        assertTrue(response.getTimestamp() > 0);
        
        // Verify interactions
        verify(blockListService, times(1)).isBlocked("1234567890");
        verify(kafkaProducerService, times(1)).sendSmsEvent(any(SmsEvent.class));
    }

    @Test
    void testBlockedUser() {
        // Arrange
        when(blockListService.isBlocked("1234567890")).thenReturn(true);

        // Act & Assert
        UserBlockedException exception = assertThrows(UserBlockedException.class, () -> {
            smsService.sendSms(validRequest);
        });

        assertEquals("User is blocked: 1234567890", exception.getMessage());
        
        // Verify interactions
        verify(blockListService, times(1)).isBlocked("1234567890");
        verify(kafkaProducerService, never()).sendSmsEvent(any(SmsEvent.class));
    }

    @Test
    void testKafkaFailure() {
        // Arrange
        when(blockListService.isBlocked("1234567890")).thenReturn(false);
        
        // Create a failed Kafka future
        CompletableFuture<SendResult<String, SmsEvent>> future = new CompletableFuture<>();
        future.completeExceptionally(new RuntimeException("Kafka connection failed"));
        
        when(kafkaProducerService.sendSmsEvent(any(SmsEvent.class))).thenReturn(future);

        // Act & Assert
        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            smsService.sendSms(validRequest);
        });

        assertTrue(exception.getMessage().contains("Failed to send SMS event to Kafka"));
        
        // Verify interactions
        verify(blockListService, times(1)).isBlocked("1234567890");
        verify(kafkaProducerService, times(1)).sendSmsEvent(any(SmsEvent.class));
    }

    @Test
    void testKafkaSynchronousFailure() {
        // Arrange
        when(blockListService.isBlocked("1234567890")).thenReturn(false);
        when(kafkaProducerService.sendSmsEvent(any(SmsEvent.class)))
            .thenThrow(new RuntimeException("Failed to send SMS event to Kafka"));

        // Act & Assert
        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            smsService.sendSms(validRequest);
        });

        assertTrue(exception.getMessage().contains("Failed to send SMS event to Kafka"));
        
        // Verify interactions
        verify(blockListService, times(1)).isBlocked("1234567890");
        verify(kafkaProducerService, times(1)).sendSmsEvent(any(SmsEvent.class));
    }

    @Test
    void testSmsEventCreation() throws Exception {
        // Arrange
        when(blockListService.isBlocked("1234567890")).thenReturn(false);
        
        CompletableFuture<SendResult<String, SmsEvent>> future = new CompletableFuture<>();
        @SuppressWarnings("unchecked")
        SendResult<String, SmsEvent> sendResult = mock(SendResult.class);
        future.complete(sendResult);
        
        when(kafkaProducerService.sendSmsEvent(any(SmsEvent.class))).thenReturn(future);

        // Act
        smsService.sendSms(validRequest);

        // Assert - Verify SmsEvent was created with correct fields
        verify(kafkaProducerService, times(1)).sendSmsEvent(argThat(event -> 
            event.getPhoneNumber().equals("1234567890") &&
            event.getText().equals("Hello World") &&
            (event.getStatus().equals("SUCCESS") || event.getStatus().equals("FAIL")) &&
            event.getTimestamp() > 0
        ));
    }

    @Test
    void testResponseContainsRequestId() throws Exception {
        // Arrange
        when(blockListService.isBlocked("1234567890")).thenReturn(false);
        
        CompletableFuture<SendResult<String, SmsEvent>> future = new CompletableFuture<>();
        @SuppressWarnings("unchecked")
        SendResult<String, SmsEvent> sendResult = mock(SendResult.class);
        future.complete(sendResult);
        
        when(kafkaProducerService.sendSmsEvent(any(SmsEvent.class))).thenReturn(future);

        // Act
        SendSmsResponse response = smsService.sendSms(validRequest);

        // Assert
        assertNotNull(response.getCorrelationId());
        assertFalse(response.getCorrelationId().isEmpty());
        // UUID format check (basic validation)
        assertTrue(response.getCorrelationId().length() > 20);
    }
}
