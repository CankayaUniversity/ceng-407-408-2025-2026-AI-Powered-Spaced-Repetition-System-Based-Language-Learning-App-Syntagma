package com.syntagma.backend.dto.response;

import com.syntagma.backend.entity.enums.MediaType;
import java.time.LocalDateTime;

public record MediaAssetResponse(
        Long mediaId,
        Long flashcardId,
        MediaType type,
        String storageKey,
        String mimeType,
        LocalDateTime createdAt
) {}
