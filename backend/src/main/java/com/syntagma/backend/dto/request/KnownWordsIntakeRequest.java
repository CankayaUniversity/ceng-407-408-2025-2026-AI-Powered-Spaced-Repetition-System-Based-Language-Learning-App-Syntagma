package com.syntagma.backend.dto.request;

import java.util.List;
import jakarta.validation.constraints.NotEmpty;

public record KnownWordsIntakeRequest(
        @NotEmpty
        List<String> knownWords
) {}
