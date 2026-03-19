package com.syntagma.backend.controller;

import com.syntagma.backend.dto.request.WordKnowledgeBatchRequest;
import com.syntagma.backend.dto.request.WordKnowledgeUpdateRequest;
import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.dto.response.WordKnowledgeResponse;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.service.WordKnowledgeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/word-knowledge")
@RequiredArgsConstructor
public class WordKnowledgeController {

    private final WordKnowledgeService wordKnowledgeService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<WordKnowledgeResponse>>> getAll(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(required = false) KnowledgeStatus status,
            @PageableDefault(size = 50) Pageable pageable) {
        Page<WordKnowledgeResponse> page = wordKnowledgeService.getAll(userId, status, pageable);
        return ResponseEntity.ok(ApiResponse.success(page));
    }

    @GetMapping("/{lemma}")
    public ResponseEntity<ApiResponse<WordKnowledgeResponse>> getByLemma(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable String lemma) {
        WordKnowledgeResponse response = wordKnowledgeService.getByLemma(userId, lemma);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{lemma}")
    public ResponseEntity<ApiResponse<WordKnowledgeResponse>> update(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable String lemma,
            @Valid @RequestBody WordKnowledgeUpdateRequest request) {
        WordKnowledgeResponse response = wordKnowledgeService.update(userId, lemma, request.status());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/batch")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> batchUpdate(
            @RequestHeader("X-User-Id") Long userId,
            @Valid @RequestBody WordKnowledgeBatchRequest request) {
        int updated = wordKnowledgeService.batchUpdate(userId, request.entries());
        return ResponseEntity.ok(ApiResponse.success(Map.of("updated", updated)));
    }
}
