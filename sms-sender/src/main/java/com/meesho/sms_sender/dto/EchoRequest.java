package com.meesho.sms_sender.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class EchoRequest {

    @Pattern(regexp = "^[0-9]{10}$", message = "phoneNumber must be a 10 digit number")
    private String phoneNumber;

    @NotBlank(message = "message must not be blank")
    private String message;
}
