package com.syntagma.backend.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record WordKnowledgeBatchRequest(
        @NotEmpty @Valid List<WordKnowledgeBatchEntry> entries
) {}
