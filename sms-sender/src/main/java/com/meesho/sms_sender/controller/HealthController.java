package com.meesho.sms_sender.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    @GetMapping("/")
    public String home() {
        return "Sms Sender is running";
    }

    @GetMapping("/health")
    public String health() {
        return "OK";
    }
}
