package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.NotNull;

public record EbookProgressUpdateRequest(
        @NotNull Integer lastPage
) {}
