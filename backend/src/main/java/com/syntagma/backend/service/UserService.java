package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.UserRegisterRequest;
import com.syntagma.backend.dto.request.UserUpdateRequest;
import com.syntagma.backend.dto.response.AuthResponse;
import com.syntagma.backend.dto.response.UserResponse;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.exception.DuplicateResourceException;
import com.syntagma.backend.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    @Transactional
    public UserResponse register(UserRegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new DuplicateResourceException("Email already registered: " + request.email());
        }

        User user = new User();
        user.setEmail(request.email());
        // TODO: Use BCrypt when Spring Security is added
        user.setPasswordHash(request.password());
        user.setCreatedAt(LocalDateTime.now());
        user.setStreakCount(0);

        User saved = userRepository.save(user);
        return toResponse(saved);
    }

    public AuthResponse login(String email, String password) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));

        // TODO: Use BCrypt password matching when Spring Security is added
        if (!user.getPasswordHash().equals(password)) {
            throw new IllegalArgumentException("Invalid email or password");
        }

        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        // TODO: Generate real JWT token
        String token = "jwt-placeholder-token";
        return new AuthResponse(token, user.getUserId(), user.getEmail());
    }

    public UserResponse getUserById(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));
        return toResponse(user);
    }

    @Transactional
    public UserResponse updateUser(Long userId, UserUpdateRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));

        if (request.email() != null && !request.email().equals(user.getEmail())) {
            if (userRepository.existsByEmail(request.email())) {
                throw new DuplicateResourceException("Email already in use: " + request.email());
            }
            user.setEmail(request.email());
        }

        User saved = userRepository.save(user);
        return toResponse(saved);
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(
                user.getUserId(),
                user.getEmail(),
                user.getCreatedAt(),
                user.getLastLoginAt(),
                user.getStreakCount()
        );
    }
}
