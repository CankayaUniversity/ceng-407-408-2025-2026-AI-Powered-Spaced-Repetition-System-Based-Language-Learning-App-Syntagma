package com.syntagma.backend.dto.response;

import java.time.LocalDateTime;

public record SyncStatusResponse(
        LocalDateTime lastSyncAt,
        long pendingEvents,
        long failedEvents
) {}
