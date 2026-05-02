package com.syntagma.backend.dto.response;

import java.time.OffsetDateTime;

public record MediaPresignResponse(
        String uploadUrl,
        String objectKey,
        OffsetDateTime expiresAt
) {}
