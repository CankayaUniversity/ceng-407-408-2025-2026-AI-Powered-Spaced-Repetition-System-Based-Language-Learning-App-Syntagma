package com.syntagma.backend.dto.response;

import java.time.LocalDateTime;
import java.util.List;

public record DailyCardsResponse(
        int dueCount,
        int newCount,
        List<DailyCardItem> cards
) {
    public record DailyCardItem(
            Long flashcardId,
            String lemma,
            String translation,
            String type,
            LocalDateTime nextReviewAt,
            Float stability,
            Float difficulty,
            String state,
            Integer reps,
            Integer lapses
    ) {}
}
