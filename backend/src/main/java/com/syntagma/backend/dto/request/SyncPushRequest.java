package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record SyncPushRequest(
        @NotEmpty List<SyncEventRequest> events
) {}
