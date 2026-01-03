package com.meesho.sms_sender.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class EchoRequest {
    private String phoneNumber;
    private String message;
}
