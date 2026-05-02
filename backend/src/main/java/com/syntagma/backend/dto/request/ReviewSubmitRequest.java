package com.syntagma.backend.dto.request;

import com.syntagma.backend.entity.enums.DeviceType;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;

public record ReviewSubmitRequest(
        @NotNull Long flashcardId,
        Boolean known,
        Integer result,
        DeviceType device,
        OffsetDateTime clientTimestamp
) {}
