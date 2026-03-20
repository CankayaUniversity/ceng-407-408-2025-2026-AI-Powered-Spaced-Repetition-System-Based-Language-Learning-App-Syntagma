package com.syntagma.backend.controller;

import com.syntagma.backend.dto.request.ReviewSubmitRequest;
import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.dto.response.ReviewLogResponse;
import com.syntagma.backend.dto.response.ReviewResultResponse;
import com.syntagma.backend.dto.response.ReviewStatsResponse;
import com.syntagma.backend.service.ReviewService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/reviews")
@RequiredArgsConstructor
public class ReviewController {

    private final ReviewService reviewService;

    @PostMapping
    public ResponseEntity<ApiResponse<ReviewResultResponse>> submitReview(
            @RequestHeader("X-User-Id") Long userId,
            @Valid @RequestBody ReviewSubmitRequest request) {
        ReviewResultResponse response = reviewService.submitReview(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Page<ReviewLogResponse>>> getReviews(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(required = false) Long flashcardId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate,
            @PageableDefault(size = 20) Pageable pageable) {
        Page<ReviewLogResponse> page = reviewService.getReviews(userId, flashcardId, startDate, endDate, pageable);
        return ResponseEntity.ok(ApiResponse.success(page));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<ReviewStatsResponse>> getStats(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "week") String period) {
        ReviewStatsResponse stats = reviewService.getStats(userId, period);
        return ResponseEntity.ok(ApiResponse.success(stats));
    }
}
