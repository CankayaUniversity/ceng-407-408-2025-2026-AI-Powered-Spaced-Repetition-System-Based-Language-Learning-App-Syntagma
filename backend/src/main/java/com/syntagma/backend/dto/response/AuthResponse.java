package com.syntagma.backend.dto.response;

import java.time.LocalDateTime;

public record AuthResponse(
        String token,
        Long userId,
        String email
) {}
