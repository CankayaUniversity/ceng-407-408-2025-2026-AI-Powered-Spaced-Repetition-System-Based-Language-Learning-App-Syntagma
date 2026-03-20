package com.syntagma.backend.controller;

import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.dto.response.MediaAssetResponse;
import com.syntagma.backend.entity.enums.MediaType;
import com.syntagma.backend.service.MediaAssetService;
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
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long flashcardId,
            @RequestParam("file") MultipartFile file,
            @RequestParam("type") MediaType type) {
        MediaAssetResponse response = mediaAssetService.upload(userId, flashcardId, file, type);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping("/api/flashcards/{flashcardId}/media")
    public ResponseEntity<ApiResponse<List<MediaAssetResponse>>> getByFlashcard(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long flashcardId) {
        List<MediaAssetResponse> assets = mediaAssetService.getByFlashcard(userId, flashcardId);
        return ResponseEntity.ok(ApiResponse.success(assets));
    }

    @GetMapping("/api/media/{mediaId}")
    public ResponseEntity<ApiResponse<MediaAssetResponse>> getById(
            @PathVariable Long mediaId) {
        MediaAssetResponse response = mediaAssetService.getById(mediaId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/api/media/{mediaId}")
    public ResponseEntity<Void> delete(@PathVariable Long mediaId) {
        mediaAssetService.delete(mediaId);
        return ResponseEntity.noContent().build();
    }
}
