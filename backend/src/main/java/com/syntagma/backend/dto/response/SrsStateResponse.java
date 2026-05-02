package com.syntagma.backend.dto.response;

import java.time.LocalDateTime;

public record SrsStateResponse(
        Long flashcardId,
        Float stability,
        Float difficulty,
        Float retrievable,
        LocalDateTime lastReviewedAt,
        LocalDateTime nextReviewAt
) {}
