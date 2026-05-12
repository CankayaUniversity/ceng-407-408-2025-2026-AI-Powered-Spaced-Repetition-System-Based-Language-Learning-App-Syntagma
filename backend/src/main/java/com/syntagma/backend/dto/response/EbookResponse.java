package com.syntagma.backend.dto.response;

import java.time.LocalDateTime;

public record EbookResponse(
        Long ebookId,
        Long userId,
        String title,
        String storageKey,
        String mimeType,
        String originalFileName,
        Long sizeBytes,
        Integer lastPage,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
