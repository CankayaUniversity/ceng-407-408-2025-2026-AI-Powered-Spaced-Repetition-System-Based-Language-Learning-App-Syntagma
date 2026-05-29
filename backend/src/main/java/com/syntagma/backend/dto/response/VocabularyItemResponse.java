package com.syntagma.backend.dto.response;

import com.syntagma.backend.entity.enums.KnowledgeStatus;
import java.time.LocalDateTime;

public record VocabularyItemResponse(
        String lemma,
        String lemmaKey,
        KnowledgeStatus status,
        LocalDateTime updatedAt
) {}
