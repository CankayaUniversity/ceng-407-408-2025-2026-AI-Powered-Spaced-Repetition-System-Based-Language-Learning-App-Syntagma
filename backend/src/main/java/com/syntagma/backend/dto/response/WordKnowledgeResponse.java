package com.syntagma.backend.dto.response;

import com.syntagma.backend.entity.enums.KnowledgeStatus;
import java.time.LocalDateTime;

public record WordKnowledgeResponse(
        Long userId,
        String lemma,
        KnowledgeStatus status,
        LocalDateTime updatedAt
) {}
