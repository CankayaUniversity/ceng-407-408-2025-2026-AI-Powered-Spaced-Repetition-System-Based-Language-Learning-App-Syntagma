package com.syntagma.backend.service;

import java.time.OffsetDateTime;

public record StoragePresignResult(
        String url,
        OffsetDateTime expiresAt
) {}
