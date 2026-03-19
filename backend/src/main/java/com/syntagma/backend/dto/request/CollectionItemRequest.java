package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.NotNull;

public record CollectionItemRequest(
        @NotNull Long flashcardId
) {}
