package com.syntagma.backend.dto.response;

import java.time.LocalDateTime;
import java.util.List;

public record CollectionResponse(
        Long collectionId,
        Long userId,
        String name,
        LocalDateTime createdAt,
        List<CollectionItemResponse> items
) {}
