package com.syntagma.backend.dto.response;

import java.time.LocalDateTime;

public record CollectionItemResponse(
        Long flashcardId,
        String lemma,
        String translation,
        LocalDateTime addedAt
) {}
