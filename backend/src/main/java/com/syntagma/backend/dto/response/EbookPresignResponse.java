package com.syntagma.backend.dto.response;

import java.time.OffsetDateTime;

public record EbookPresignResponse(
        String uploadUrl,
        String objectKey,
        OffsetDateTime expiresAt
) {}
