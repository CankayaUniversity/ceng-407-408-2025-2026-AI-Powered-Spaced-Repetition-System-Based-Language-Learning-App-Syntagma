package com.syntagma.backend.controller;

import com.syntagma.backend.dto.request.EbookCreateRequest;
import com.syntagma.backend.dto.request.EbookPresignRequest;
import com.syntagma.backend.dto.request.EbookProgressUpdateRequest;
import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.dto.response.EbookPresignResponse;
import com.syntagma.backend.dto.response.EbookResponse;
import com.syntagma.backend.dto.response.EbookUrlResponse;
import com.syntagma.backend.security.SecurityUtils;
import com.syntagma.backend.service.EbookService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ebooks")
public class EbookController {

    private final EbookService ebookService;

    @PostMapping("/presign")
    public ResponseEntity<ApiResponse<EbookPresignResponse>> presignUpload(
            @Valid @RequestBody EbookPresignRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        EbookPresignResponse response = ebookService.createPresignedUpload(userId, request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<EbookResponse>> create(
            @Valid @RequestBody EbookCreateRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        EbookResponse response = ebookService.createEbook(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<EbookResponse>>> getAll() {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        List<EbookResponse> ebooks = ebookService.getAll(userId);
        return ResponseEntity.ok(ApiResponse.success(ebooks));
    }

    @GetMapping("/{ebookId}")
    public ResponseEntity<ApiResponse<EbookResponse>> getById(
            @PathVariable Long ebookId) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        EbookResponse response = ebookService.getById(userId, ebookId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/{ebookId}/url")
    public ResponseEntity<ApiResponse<EbookUrlResponse>> getDownloadUrl(
            @PathVariable Long ebookId) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        EbookUrlResponse response = ebookService.getDownloadUrl(userId, ebookId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{ebookId}/progress")
    public ResponseEntity<ApiResponse<EbookResponse>> updateProgress(
            @PathVariable Long ebookId,
            @Valid @RequestBody EbookProgressUpdateRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        EbookResponse response = ebookService.updateProgress(userId, ebookId, request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/{ebookId}")
    public ResponseEntity<Void> delete(@PathVariable Long ebookId) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        ebookService.delete(userId, ebookId);
        return ResponseEntity.noContent().build();
    }
}
