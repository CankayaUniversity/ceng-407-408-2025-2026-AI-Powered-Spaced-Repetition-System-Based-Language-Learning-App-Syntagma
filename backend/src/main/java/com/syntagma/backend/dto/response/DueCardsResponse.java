package com.syntagma.backend.dto.response;

import java.util.List;

public record DueCardsResponse(
        int dueCount,
        List<DueCardItem> cards
) {
    public record DueCardItem(
            Long flashcardId,
            String lemma,
            String translation,
            java.time.LocalDateTime nextReviewAt,
            Float stability,
            Float difficulty,
            String state,
            Integer reps,
            Integer lapses
    ) {}
}
