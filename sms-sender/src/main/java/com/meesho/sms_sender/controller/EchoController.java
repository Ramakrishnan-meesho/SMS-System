package com.meesho.sms_sender.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.meesho.sms_sender.dto.EchoRequest;
import com.meesho.sms_sender.dto.EchoResponse;
import com.meesho.sms_sender.service.EchoService;

@RestController
@RequestMapping("/v1")
public class EchoController {
    private final EchoService echoService;

    public EchoController(EchoService echoService){
        this.echoService = echoService;
    }

    @PostMapping("/echo")
    public ResponseEntity<EchoResponse> echo(@RequestBody EchoRequest echoReq){
        return ResponseEntity.ok(echoService.echo(echoReq));
    }
}
