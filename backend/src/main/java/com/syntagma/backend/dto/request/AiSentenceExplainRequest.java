package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.NotBlank;

public record AiSentenceExplainRequest(
        @NotBlank String sentence,
        String level,
        String context
) {}
