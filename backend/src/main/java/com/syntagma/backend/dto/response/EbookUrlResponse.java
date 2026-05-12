package com.syntagma.backend.dto.response;

import java.time.OffsetDateTime;

public record EbookUrlResponse(
        String downloadUrl,
        OffsetDateTime expiresAt
) {}
