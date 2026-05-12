package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record EbookPresignRequest(
        @NotBlank String fileName,
        @NotBlank String contentType,
        @NotNull Long size
) {}
