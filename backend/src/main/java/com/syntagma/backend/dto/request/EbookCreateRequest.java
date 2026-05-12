package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record EbookCreateRequest(
        @NotBlank String objectKey,
        @NotBlank String originalFileName,
        @NotBlank String contentType,
        @NotNull Long size,
        String title
) {}
