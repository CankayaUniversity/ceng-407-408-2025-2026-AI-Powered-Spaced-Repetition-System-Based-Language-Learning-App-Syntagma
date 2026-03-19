package com.syntagma.backend.dto.response;

import com.syntagma.backend.entity.enums.DeviceType;
import java.time.LocalDateTime;

public record ReviewLogResponse(
        Long reviewId,
        Long flashcardId,
        Long userId,
        LocalDateTime reviewedAt,
        Integer result,
        DeviceType device,
        LocalDateTime clientTimestamp
) {}
