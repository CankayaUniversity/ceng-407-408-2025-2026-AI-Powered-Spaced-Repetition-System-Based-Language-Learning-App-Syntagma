package com.syntagma.backend.dto.request;

import com.syntagma.backend.entity.enums.DeviceType;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;

public record ReviewSubmitRequest(
        @NotNull Long flashcardId,
        @NotNull Integer result,
        DeviceType device,
        LocalDateTime clientTimestamp
) {}
