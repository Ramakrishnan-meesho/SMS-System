package com.meesho.sms_sender.service;

import org.springframework.stereotype.Service;

import com.meesho.sms_sender.dto.EchoRequest;
import com.meesho.sms_sender.dto.EchoResponse;

@Service
public class EchoService {
    public EchoResponse echo(EchoRequest req){
        return new EchoResponse(req.getPhoneNumber(),
                            req.getMessage(),
                            System.currentTimeMillis()
                        );
    }
}
