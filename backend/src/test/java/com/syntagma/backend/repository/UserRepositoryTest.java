package com.syntagma.backend.repository;

import com.syntagma.backend.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Test
    void findByEmail_Success() {
        // Arrange
        User user = new User();
        user.setEmail("test@dao.com");
        user.setPasswordHash("pass");
        user.setCreatedAt(LocalDateTime.now());
        user.setStreakCount(0);
        userRepository.save(user);

        // Act
        Optional<User> found = userRepository.findByEmail("test@dao.com");

        // Assert
        assertTrue(found.isPresent());
        assertEquals("test@dao.com", found.get().getEmail());
    }

    @Test
    void existsByEmail_Success() {
        // Arrange
        User user = new User();
        user.setEmail("exist@dao.com");
        user.setPasswordHash("pass");
        user.setCreatedAt(LocalDateTime.now());
        user.setStreakCount(0);
        userRepository.save(user);

        // Act & Assert
        assertTrue(userRepository.existsByEmail("exist@dao.com"));
        assertFalse(userRepository.existsByEmail("nonexistent@dao.com"));
    }
}
