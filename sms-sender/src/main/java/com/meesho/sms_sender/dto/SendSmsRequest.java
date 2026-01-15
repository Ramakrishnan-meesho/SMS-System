package com.meesho.sms_sender.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SendSmsRequest {

    @Pattern(regexp = "^\\d{10}$", message = "phoneNumber must be exactly 10 digits")
    @NotBlank(message = "phoneNumber must not be blank")
    private String phoneNumber;

    @NotBlank(message = "message must not be blank")
    private String message;
}
