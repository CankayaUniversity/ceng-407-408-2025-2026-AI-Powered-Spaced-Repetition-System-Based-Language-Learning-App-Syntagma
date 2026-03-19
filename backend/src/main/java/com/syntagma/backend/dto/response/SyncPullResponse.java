package com.syntagma.backend.dto.response;

import com.syntagma.backend.entity.enums.SyncEventType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record SyncPullResponse(
        LocalDateTime serverTimestamp,
        List<SyncChange> changes
) {
    public record SyncChange(
            String entityType,
            Long entityId,
            SyncEventType eventType,
            LocalDateTime serverReceivedAt,
            Map<String, Object> data
    ) {}
}
