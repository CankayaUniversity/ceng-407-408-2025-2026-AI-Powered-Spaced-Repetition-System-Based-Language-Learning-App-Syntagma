package com.syntagma.backend.dto.response;

public record ReviewResultResponse(
        Long reviewId,
        Long flashcardId,
        Integer result,
        java.time.LocalDateTime reviewedAt,
        SrsStateResponse updatedSrsState
) {}
