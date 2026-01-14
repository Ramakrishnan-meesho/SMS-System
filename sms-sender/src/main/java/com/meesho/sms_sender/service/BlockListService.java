package com.meesho.sms_sender.service;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * Service for managing user block list in Redis.
 * Blocked users are stored with key pattern: blocked:user:{userId}
 */
@Service
public class BlockListService {

    private static final String BLOCK_KEY_PREFIX = "blocked:user:";
    
    private final StringRedisTemplate redisTemplate;

    public BlockListService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * Checks if a user is blocked.
     * 
     * @param userId The user ID to check
     * @return true if user is blocked, false otherwise
     */
    public boolean isBlocked(String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        String key = BLOCK_KEY_PREFIX + userId;
        String value = redisTemplate.opsForValue().get(key);
        return value != null && "true".equals(value);
    }

    /**
     * Blocks a user by adding them to the block list.
     * 
     * @param userId The user ID to block
     */
    public void blockUser(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("User ID cannot be null or blank");
        }
        String key = BLOCK_KEY_PREFIX + userId;
        redisTemplate.opsForValue().set(key, "true");
    }

    /**
     * Unblocks a user by removing them from the block list.
     * 
     * @param userId The user ID to unblock
     */
    public void unblockUser(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("User ID cannot be null or blank");
        }
        String key = BLOCK_KEY_PREFIX + userId;
        redisTemplate.delete(key);
    }
}
