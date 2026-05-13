package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record EbookProgressUpdateRequest(
        @NotNull @PositiveOrZero Integer lastPage
) {}
