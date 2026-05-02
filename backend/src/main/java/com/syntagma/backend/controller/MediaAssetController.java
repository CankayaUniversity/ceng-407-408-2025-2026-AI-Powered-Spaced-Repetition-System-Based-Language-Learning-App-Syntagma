package com.syntagma.backend.controller;

import com.syntagma.backend.dto.request.MediaCreateRequest;
import com.syntagma.backend.dto.request.MediaPresignRequest;
import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.dto.response.MediaAssetResponse;
import com.syntagma.backend.dto.response.MediaPresignResponse;
import com.syntagma.backend.dto.response.MediaUrlResponse;
import com.syntagma.backend.entity.enums.MediaType;
import com.syntagma.backend.security.SecurityUtils;
import com.syntagma.backend.service.MediaAssetService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class MediaAssetController {

    private final MediaAssetService mediaAssetService;

    @PostMapping("/api/flashcards/{flashcardId}/media")
    public ResponseEntity<ApiResponse<MediaAssetResponse>> upload(
            @PathVariable Long flashcardId,
            @RequestParam("file") MultipartFile file,
            @RequestParam("type") MediaType type) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        MediaAssetResponse response = mediaAssetService.upload(userId, flashcardId, file, type);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping("/api/flashcards/{flashcardId}/media")
    public ResponseEntity<ApiResponse<List<MediaAssetResponse>>> getByFlashcard(
            @PathVariable Long flashcardId) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        List<MediaAssetResponse> assets = mediaAssetService.getByFlashcard(userId, flashcardId);
        return ResponseEntity.ok(ApiResponse.success(assets));
    }

    @PostMapping("/api/media/presign")
    public ResponseEntity<ApiResponse<MediaPresignResponse>> presignUpload(
            @Valid @RequestBody MediaPresignRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        MediaPresignResponse response = mediaAssetService.createPresignedUpload(userId, request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/api/media")
    public ResponseEntity<ApiResponse<MediaAssetResponse>> createMedia(
            @Valid @RequestBody MediaCreateRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        MediaAssetResponse response = mediaAssetService.createMediaAsset(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping("/api/media/{mediaId}")
    public ResponseEntity<ApiResponse<MediaAssetResponse>> getById(
            @PathVariable Long mediaId) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        MediaAssetResponse response = mediaAssetService.getById(userId, mediaId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/api/media/{mediaId}/url")
    public ResponseEntity<ApiResponse<MediaUrlResponse>> getDownloadUrl(
            @PathVariable Long mediaId) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        MediaUrlResponse response = mediaAssetService.getDownloadUrl(userId, mediaId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/api/media/{mediaId}")
    public ResponseEntity<Void> delete(@PathVariable Long mediaId) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        mediaAssetService.delete(userId, mediaId);
        return ResponseEntity.noContent().build();
    }
}
