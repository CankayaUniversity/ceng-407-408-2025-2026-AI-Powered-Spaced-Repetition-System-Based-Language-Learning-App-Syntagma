package com.syntagma.backend.dto.response;

import java.time.LocalDateTime;

public record SrsStateResponse(
        Long flashcardId,
        Float stability,
        Float difficulty,
        Float retrievability,
        String state,
        Integer reps,
        Integer lapses,
        Integer scheduledDays,
        Integer elapsedDays,
        LocalDateTime lastReviewedAt,
        LocalDateTime nextReviewAt
) {}
