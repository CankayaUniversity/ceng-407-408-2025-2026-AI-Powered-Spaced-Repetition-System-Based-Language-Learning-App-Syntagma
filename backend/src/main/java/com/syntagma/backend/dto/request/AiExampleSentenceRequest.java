package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.NotBlank;

public record AiExampleSentenceRequest(
        @NotBlank String word,
        String sentence,
        String level
) {}
