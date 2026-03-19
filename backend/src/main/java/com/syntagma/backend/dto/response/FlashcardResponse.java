package com.syntagma.backend.dto.response;

import com.syntagma.backend.entity.enums.KnowledgeStatus;
import java.time.LocalDateTime;

public record FlashcardResponse(
        Long flashcardId,
        Long userId,
        String lemma,
        String translation,
        String sourceSentence,
        String exampleSentence,
        KnowledgeStatus knowledgeStatus,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
