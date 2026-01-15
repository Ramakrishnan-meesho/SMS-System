package com.meesho.sms_sender.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SendSmsResponse {
    /**
     * Correlation ID for tracking the SMS request across services
     * This ID is used to correlate the request with Kafka events and logs
     */
    private String correlationId;

    /**
     * SMS delivery status: "PENDING" initially, will be updated asynchronously
     * Possible values: "PENDING", "SUCCESS", "FAIL"
     */
    private String status;

    /**
     * Timestamp when the request was received (milliseconds since epoch)
     */
    private long timestamp;
}
