package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.UserRegisterRequest;
import com.syntagma.backend.dto.response.UserResponse;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.exception.DuplicateResourceException;
import com.syntagma.backend.repository.UserRepository;
import com.syntagma.backend.security.JwtService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    @InjectMocks
    private UserService userService;

    @Test
    void register_Success() {
        // Arrange
        UserRegisterRequest request = new UserRegisterRequest("test@example.com", "password123");
        User savedUser = new User();
        savedUser.setUserId(1L);
        savedUser.setEmail("test@example.com");
        savedUser.setCreatedAt(LocalDateTime.now());
        savedUser.setStreakCount(0);

        when(userRepository.existsByEmail("test@example.com")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("hashedPassword");
        when(userRepository.save(any(User.class))).thenReturn(savedUser);

        // Act
        UserResponse response = userService.register(request);

        // Assert
        assertNotNull(response);
        assertEquals(1L, response.userId());
        assertEquals("test@example.com", response.email());
        verify(userRepository).save(any(User.class));
    }

    @Test
    void register_ThrowsDuplicateResourceException() {
        // Arrange
        UserRegisterRequest request = new UserRegisterRequest("test@example.com", "password123");
        when(userRepository.existsByEmail("test@example.com")).thenReturn(true);

        // Act & Assert
        assertThrows(DuplicateResourceException.class, () -> userService.register(request));
        verify(userRepository, never()).save(any(User.class));
    }
}
