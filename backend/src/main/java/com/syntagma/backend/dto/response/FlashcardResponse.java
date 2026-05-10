package com.syntagma.backend.dto.response;

import com.syntagma.backend.entity.enums.KnowledgeStatus;
import java.time.LocalDateTime;
import java.util.List;

public record FlashcardResponse(
        Long flashcardId,
        Long userId,
        String lemma,
        String translation,
        String sourceSentence,
        String exampleSentence,
        KnowledgeStatus knowledgeStatus,
        List<Long> collectionIds,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
