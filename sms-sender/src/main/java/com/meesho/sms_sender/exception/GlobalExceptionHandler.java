package com.meesho.sms_sender.exception;

import com.meesho.sms_sender.dto.ErrorResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> details = new HashMap<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(err -> details.put(err.getField(), err.getDefaultMessage()));

        ErrorResponse resp = new ErrorResponse(
                "VALIDATION_ERROR",
                "Request validation failed",
                details,
                Instant.now()
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(resp);
    }


    @ExceptionHandler(NoteNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NoteNotFoundException ex) {
        ErrorResponse resp = new ErrorResponse(
                "NOT_FOUND",
                ex.getMessage(),
                Map.of(),
                Instant.now()
        );
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(resp);
    }

    @ExceptionHandler(UserBlockedException.class)
    public ResponseEntity<ErrorResponse> handleUserBlocked(UserBlockedException ex) {
        ErrorResponse resp = new ErrorResponse(
                "USER_BLOCKED",
                ex.getMessage(),
                Map.of(),
                Instant.now()
        );
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(resp);
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ErrorResponse> handleRuntimeException(RuntimeException ex) {
        // Check if it's a Kafka-related error
        if (ex.getMessage() != null && ex.getMessage().contains("Kafka")) {
            ErrorResponse resp = new ErrorResponse(
                    "KAFKA_ERROR",
                    "Failed to send SMS event to Kafka. SMS may have been sent to third-party API.",
                    Map.of("error", ex.getMessage()),
                    Instant.now()
            );
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(resp);
        }

        // Generic RuntimeException handler (fallback)
        ErrorResponse resp = new ErrorResponse(
                "INTERNAL_ERROR",
                "Something went wrong",
                Map.of("reason", ex.getClass().getSimpleName()),
                Instant.now()
        );
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(resp);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        ErrorResponse resp = new ErrorResponse(
                "INTERNAL_ERROR",
                "Something went wrong",
                Map.of("reason", ex.getClass().getSimpleName()),
                Instant.now()
        );
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(resp);
    }

}
