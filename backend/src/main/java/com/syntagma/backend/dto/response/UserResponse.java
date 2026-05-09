package com.syntagma.backend.dto.response;

import java.time.LocalDateTime;

public record UserResponse(
        Long userId,
        String email,
        LocalDateTime createdAt,
        LocalDateTime lastLoginAt,
        Integer streakCount,
        Integer dailyNewCardLimit
) {}
