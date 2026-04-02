package com.syntagma.backend.controller;

import com.syntagma.backend.dto.request.FlashcardCreateRequest;
import com.syntagma.backend.dto.request.FlashcardUpdateRequest;
import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.dto.response.FlashcardResponse;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.security.SecurityUtils;
import com.syntagma.backend.service.FlashcardService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/flashcards")
@RequiredArgsConstructor
public class FlashcardController {

    private final FlashcardService flashcardService;

    @PostMapping
    public ResponseEntity<ApiResponse<FlashcardResponse>> create(
            @RequestBody FlashcardCreateRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        FlashcardResponse response = flashcardService.create(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Page<FlashcardResponse>>> getAll(
            @RequestParam(required = false) KnowledgeStatus knowledgeStatus,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        Page<FlashcardResponse> page = flashcardService.getAll(userId, knowledgeStatus, search, pageable);
        return ResponseEntity.ok(ApiResponse.success(page));
    }

    @GetMapping("/{flashcardId}")
    public ResponseEntity<ApiResponse<FlashcardResponse>> getById(
            @PathVariable Long flashcardId) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        FlashcardResponse response = flashcardService.getById(userId, flashcardId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{flashcardId}")
    public ResponseEntity<ApiResponse<FlashcardResponse>> update(
            @PathVariable Long flashcardId,
            @RequestBody FlashcardUpdateRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        FlashcardResponse response = flashcardService.update(userId, flashcardId, request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/{flashcardId}")
    public ResponseEntity<Void> delete(
            @PathVariable Long flashcardId) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        flashcardService.delete(userId, flashcardId);
        return ResponseEntity.noContent().build();
    }
}
