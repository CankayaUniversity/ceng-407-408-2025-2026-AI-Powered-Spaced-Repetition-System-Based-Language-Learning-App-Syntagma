package com.syntagma.backend.dto.response;

public record AiTranslateResponse(
        String naturalTranslation,
        String literalTranslation,
        String alternativeTranslation
) {}
