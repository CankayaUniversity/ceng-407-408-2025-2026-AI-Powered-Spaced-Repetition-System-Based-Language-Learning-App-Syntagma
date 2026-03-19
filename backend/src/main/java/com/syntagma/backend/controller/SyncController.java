package com.syntagma.backend.controller;

import com.syntagma.backend.dto.request.SyncPushRequest;
import com.syntagma.backend.dto.response.*;
import com.syntagma.backend.service.SyncService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/sync")
@RequiredArgsConstructor
public class SyncController {

    private final SyncService syncService;

    @PostMapping("/push")
    public ResponseEntity<ApiResponse<SyncPushResponse>> push(
            @RequestHeader("X-User-Id") Long userId,
            @Valid @RequestBody SyncPushRequest request) {
        SyncPushResponse response = syncService.pushEvents(userId, request.events());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/pull")
    public ResponseEntity<ApiResponse<SyncPullResponse>> pull(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime since) {
        SyncPullResponse response = syncService.pullEvents(userId, since);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<SyncStatusResponse>> status(
            @RequestHeader("X-User-Id") Long userId) {
        SyncStatusResponse response = syncService.getStatus(userId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
