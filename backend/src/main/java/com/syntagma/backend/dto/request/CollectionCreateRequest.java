package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.NotBlank;

public record CollectionCreateRequest(
        @NotBlank String name
) {}
