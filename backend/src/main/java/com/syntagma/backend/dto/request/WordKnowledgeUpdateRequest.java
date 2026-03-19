package com.syntagma.backend.dto.request;

import com.syntagma.backend.entity.enums.KnowledgeStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record WordKnowledgeUpdateRequest(
        @NotNull KnowledgeStatus status
) {}
