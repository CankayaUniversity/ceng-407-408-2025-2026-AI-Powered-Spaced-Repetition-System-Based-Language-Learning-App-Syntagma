package com.syntagma.backend.controller;

import com.syntagma.backend.dto.request.KnownWordsIntakeRequest;
import com.syntagma.backend.dto.request.LevelKnownWordsRequest;
import com.syntagma.backend.dto.request.WordKnowledgeBatchEntry;
import com.syntagma.backend.dto.request.WordKnowledgeBatchRequest;
import com.syntagma.backend.dto.request.WordKnowledgeUpdateRequest;
import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.dto.response.WordKnowledgeResponse;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.security.SecurityUtils;
import com.syntagma.backend.service.WordKnowledgeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/word-knowledge")
@RequiredArgsConstructor
public class WordKnowledgeController {

    private final WordKnowledgeService wordKnowledgeService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<WordKnowledgeResponse>>> getAll(
            @RequestParam(required = false) KnowledgeStatus status,
            @PageableDefault(size = 50) Pageable pageable) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        Page<WordKnowledgeResponse> page = wordKnowledgeService.getAll(userId, status, pageable);
        return ResponseEntity.ok(ApiResponse.success(page));
    }

    @GetMapping("/{lemma}")
    public ResponseEntity<ApiResponse<WordKnowledgeResponse>> getByLemma(
            @PathVariable String lemma) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        WordKnowledgeResponse response = wordKnowledgeService.getByLemma(userId, lemma);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{lemma}")
    public ResponseEntity<ApiResponse<WordKnowledgeResponse>> update(
            @PathVariable String lemma,
            @Valid @RequestBody WordKnowledgeUpdateRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        WordKnowledgeResponse response = wordKnowledgeService.update(userId, lemma, request.status());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/{lemma}")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> delete(
            @PathVariable String lemma) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        wordKnowledgeService.delete(userId, lemma);
        return ResponseEntity.ok(ApiResponse.success(Map.of("deleted", true)));
    }

    @PostMapping("/batch")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> batchUpdate(
            @Valid @RequestBody WordKnowledgeBatchRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        int updated = wordKnowledgeService.batchUpdate(userId, request.entries());
        return ResponseEntity.ok(ApiResponse.success(Map.of("updated", updated)));
    }

    @PostMapping("/known-words")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> intakeKnownWords(
            @Valid @RequestBody KnownWordsIntakeRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        List<WordKnowledgeBatchEntry> entries = request.knownWords().stream()
                .map(word -> new WordKnowledgeBatchEntry(word, KnowledgeStatus.KNOWN))
                .toList();
        int updated = wordKnowledgeService.batchUpdate(userId, entries);
        return ResponseEntity.ok(ApiResponse.success(Map.of("updated", updated)));
    }

    @PostMapping("/level")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> intakeKnownWordsByLevel(
            @Valid @RequestBody LevelKnownWordsRequest request) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        int updated = wordKnowledgeService.markKnownByLevel(userId, request.level());
        return ResponseEntity.ok(ApiResponse.success(Map.of("updated", updated)));
    }
}
