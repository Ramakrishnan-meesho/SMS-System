package com.meesho.sms_sender.exception;

public class UserBlockedException extends RuntimeException {
    public UserBlockedException(String userId) {
        super("User is blocked: " + userId);
    }
}
