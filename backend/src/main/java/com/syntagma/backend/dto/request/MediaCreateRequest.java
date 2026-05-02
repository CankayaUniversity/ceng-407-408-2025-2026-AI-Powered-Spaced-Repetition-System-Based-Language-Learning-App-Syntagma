package com.syntagma.backend.dto.request;

import com.syntagma.backend.entity.enums.MediaType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record MediaCreateRequest(
        @NotNull Long flashcardId,
        @NotNull MediaType type,
        @NotBlank String objectKey,
        @NotBlank String originalFileName,
        @NotBlank String contentType,
        @NotNull Long size
) {}
