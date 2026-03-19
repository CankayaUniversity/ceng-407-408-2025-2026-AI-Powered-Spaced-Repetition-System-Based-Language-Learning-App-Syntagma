package com.syntagma.backend.controller;

import com.syntagma.backend.dto.request.UserLoginRequest;
import com.syntagma.backend.dto.request.UserRegisterRequest;
import com.syntagma.backend.dto.response.ApiResponse;
import com.syntagma.backend.dto.response.AuthResponse;
import com.syntagma.backend.dto.response.UserResponse;
import com.syntagma.backend.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserService userService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<UserResponse>> register(@Valid @RequestBody UserRegisterRequest request) {
        UserResponse user = userService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(user));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody UserLoginRequest request) {
        AuthResponse auth = userService.login(request.email(), request.password());
        return ResponseEntity.ok(ApiResponse.success(auth));
    }
}
