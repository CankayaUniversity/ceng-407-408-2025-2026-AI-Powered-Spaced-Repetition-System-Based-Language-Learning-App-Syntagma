package com.syntagma.backend.dto.response;

import java.time.OffsetDateTime;

public record MediaUrlResponse(
        String downloadUrl,
        OffsetDateTime expiresAt
) {}
