package com.syntagma.backend.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record UserRegisterRequest(
        @NotBlank @Email String email,
        @NotBlank String password
) {}
