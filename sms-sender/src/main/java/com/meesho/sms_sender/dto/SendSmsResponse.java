package com.meesho.sms_sender.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SendSmsResponse {
    /**
     * Unique request ID (UUID) for tracking the SMS request
     */
    private String requestId;

    /**
     * SMS delivery status: "SUCCESS" or "FAIL" from the third-party SMS API
     */
    private String status;

    /**
     * Timestamp when the request was processed (milliseconds since epoch)
     */
    private long timestamp;
}
