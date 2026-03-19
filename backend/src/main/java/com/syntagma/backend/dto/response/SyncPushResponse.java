package com.syntagma.backend.dto.response;

import com.syntagma.backend.entity.enums.SyncEventType;
import com.syntagma.backend.entity.enums.SyncStatus;
import java.util.List;

public record SyncPushResponse(
        int processed,
        int failed,
        List<SyncResultItem> results
) {
    public record SyncResultItem(
            Long syncId,
            SyncEventType eventType,
            SyncStatus status,
            Long entityId
    ) {}
}
