package com.syntagma.backend.controller;

import com.syntagma.backend.dto.request.CollectionCreateRequest;
import com.syntagma.backend.dto.request.CollectionItemRequest;
import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.dto.response.CollectionItemResponse;
import com.syntagma.backend.dto.response.CollectionResponse;
import com.syntagma.backend.service.CollectionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/collections")
@RequiredArgsConstructor
public class CollectionController {

    private final CollectionService collectionService;

    @PostMapping
    public ResponseEntity<ApiResponse<CollectionResponse>> create(
            @RequestHeader("X-User-Id") Long userId,
            @Valid @RequestBody CollectionCreateRequest request) {
        CollectionResponse response = collectionService.create(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Page<CollectionResponse>>> getAll(
            @RequestHeader("X-User-Id") Long userId,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        Page<CollectionResponse> page = collectionService.getAll(userId, pageable);
        return ResponseEntity.ok(ApiResponse.success(page));
    }

    @GetMapping("/{collectionId}")
    public ResponseEntity<ApiResponse<CollectionResponse>> getById(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long collectionId) {
        CollectionResponse response = collectionService.getById(userId, collectionId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{collectionId}")
    public ResponseEntity<ApiResponse<CollectionResponse>> update(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long collectionId,
            @Valid @RequestBody CollectionCreateRequest request) {
        CollectionResponse response = collectionService.update(userId, collectionId, request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/{collectionId}")
    public ResponseEntity<Void> delete(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long collectionId) {
        collectionService.delete(userId, collectionId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{collectionId}/items")
    public ResponseEntity<ApiResponse<CollectionItemResponse>> addItem(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long collectionId,
            @Valid @RequestBody CollectionItemRequest request) {
        CollectionItemResponse response = collectionService.addItem(userId, collectionId, request.flashcardId());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @DeleteMapping("/{collectionId}/items/{flashcardId}")
    public ResponseEntity<Void> removeItem(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long collectionId,
            @PathVariable Long flashcardId) {
        collectionService.removeItem(userId, collectionId, flashcardId);
        return ResponseEntity.noContent().build();
    }
}
