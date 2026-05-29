package com.syntagma.backend.controller;

import com.syntagma.backend.dto.request.SyncPushRequest;
import com.syntagma.backend.dto.response.*;
import com.syntagma.backend.security.SecurityUtils;
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
            @Valid @RequestBody SyncPushRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        SyncPushResponse response = syncService.pushEvents(userId, request.events());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/pull")
    public ResponseEntity<ApiResponse<SyncPullResponse>> pull(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime since) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        SyncPullResponse response = syncService.pullEvents(userId, since);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/status")
    public ResponseEntity<ApiResponse<SyncStatusResponse>> status() {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        SyncStatusResponse response = syncService.getStatus(userId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
