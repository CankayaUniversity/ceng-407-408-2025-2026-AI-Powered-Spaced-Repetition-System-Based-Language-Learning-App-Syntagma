package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record AiWordExplainRequest(
        @NotBlank String word,
        @NotBlank String sentence,
        String context,
        String level,
        @Min(1) @Max(5) Integer exampleCount
) {}
