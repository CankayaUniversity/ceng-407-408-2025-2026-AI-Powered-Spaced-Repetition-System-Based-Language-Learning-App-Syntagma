package com.syntagma.backend.controller;

import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.dto.response.DueCardsResponse;
import com.syntagma.backend.dto.response.SrsStateResponse;
import com.syntagma.backend.service.SrsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class SrsController {

    private final SrsService srsService;

    @GetMapping("/api/flashcards/{flashcardId}/srs")
    public ResponseEntity<ApiResponse<SrsStateResponse>> getSrsState(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long flashcardId) {
        SrsStateResponse response = srsService.getSrsState(userId, flashcardId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/api/srs/due")
    public ResponseEntity<ApiResponse<DueCardsResponse>> getDueCards(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "20") int limit) {
        DueCardsResponse response = srsService.getDueCards(userId, limit);
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
