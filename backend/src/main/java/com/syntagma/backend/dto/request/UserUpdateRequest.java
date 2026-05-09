package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.Email;

public record UserUpdateRequest(
        @Email String email,
        Integer dailyNewCardLimit
) {}
