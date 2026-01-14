package com.meesho.sms_sender.controller;

import com.meesho.sms_sender.service.BlockListService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Controller for managing user block list.
 * This is a testing endpoint to verify Redis block list functionality.
 */
@RestController
@RequestMapping("/v1/block")
public class BlockListController {

    private final BlockListService blockListService;

    public BlockListController(BlockListService blockListService) {
        this.blockListService = blockListService;
    }

    /**
     * Block a user.
     * POST /v1/block/{userId}
     */
    @PostMapping("/{userId}")
    public ResponseEntity<Map<String, Object>> blockUser(@PathVariable String userId) {
        blockListService.blockUser(userId);
        return ResponseEntity.ok(Map.of(
            "userId", userId,
            "status", "blocked",
            "message", "User has been blocked"
        ));
    }

    /**
     * Unblock a user.
     * DELETE /v1/block/{userId}
     */
    @DeleteMapping("/{userId}")
    public ResponseEntity<Map<String, Object>> unblockUser(@PathVariable String userId) {
        blockListService.unblockUser(userId);
        return ResponseEntity.ok(Map.of(
            "userId", userId,
            "status", "unblocked",
            "message", "User has been unblocked"
        ));
    }

    /**
     * Check if a user is blocked.
     * GET /v1/block/{userId}
     */
    @GetMapping("/{userId}")
    public ResponseEntity<Map<String, Object>> checkBlockStatus(@PathVariable String userId) {
        boolean isBlocked = blockListService.isBlocked(userId);
        return ResponseEntity.ok(Map.of(
            "userId", userId,
            "isBlocked", isBlocked,
            "message", isBlocked ? "User is blocked" : "User is not blocked"
        ));
    }
}
