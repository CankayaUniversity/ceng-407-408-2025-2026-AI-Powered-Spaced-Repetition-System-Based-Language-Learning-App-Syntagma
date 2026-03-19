package com.syntagma.backend.dto.request;

import com.syntagma.backend.entity.enums.SyncEventType;
import java.time.LocalDateTime;
import java.util.Map;

public record SyncEventRequest(
        SyncEventType eventType,
        String entityType,
        Long entityId,
        LocalDateTime clientTimestamp,
        Map<String, Object> data
) {}
