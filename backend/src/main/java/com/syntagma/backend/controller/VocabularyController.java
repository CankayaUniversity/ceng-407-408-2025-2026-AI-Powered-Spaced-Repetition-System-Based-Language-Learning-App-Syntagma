package com.syntagma.backend.controller;

import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.dto.response.VocabularyItemResponse;
import com.syntagma.backend.security.SecurityUtils;
import com.syntagma.backend.service.VocabularyService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/vocabulary")
@RequiredArgsConstructor
public class VocabularyController {

    private final VocabularyService vocabularyService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<VocabularyItemResponse>>> getVocabulary(
            @RequestParam(defaultValue = "ALL") String status,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 50, sort = "lemma") Pageable pageable) {
        Long userId = SecurityUtils.getAuthenticatedUserId();
        Page<VocabularyItemResponse> page = vocabularyService.getVocabulary(userId, status, search, pageable);
        return ResponseEntity.ok(ApiResponse.success(page));
    }
}
