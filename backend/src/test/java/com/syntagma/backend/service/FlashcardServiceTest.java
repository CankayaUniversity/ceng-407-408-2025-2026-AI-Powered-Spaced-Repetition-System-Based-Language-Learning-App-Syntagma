package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.FlashcardCreateRequest;
import com.syntagma.backend.dto.request.FlashcardUpdateRequest;
import com.syntagma.backend.dto.response.FlashcardResponse;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.repository.FlashcardRepository;
import com.syntagma.backend.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FlashcardServiceTest {

    @Mock private FlashcardRepository flashcardRepository;
    @Mock private UserRepository userRepository;
    @InjectMocks private FlashcardService flashcardService;

    private User mockUser() {
        User user = new User();
        user.setUserId(1L);
        user.setEmail("test@test.com");
        return user;
    }

    private Flashcard mockFlashcard(User user) {
        Flashcard f = new Flashcard();
        f.setFlashcardId(10L);
        f.setUser(user);
        f.setLemma("hello");
        f.setTranslation("merhaba");
        f.setSourceSentence("Hello world");
        f.setExampleSentence("Merhaba dünya");
        f.setKnowledgeStatus(KnowledgeStatus.UNKNOWN);
        f.setCreatedAt(LocalDateTime.now());
        f.setUpdatedAt(LocalDateTime.now());
        return f;
    }

    @Test
    void create_Success() {
        User user = mockUser();
        FlashcardCreateRequest request = new FlashcardCreateRequest(
                "hello", "merhaba", "Hello world", "Merhaba dünya", KnowledgeStatus.UNKNOWN);

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(flashcardRepository.save(any(Flashcard.class))).thenAnswer(inv -> {
            Flashcard f = inv.getArgument(0);
            f.setFlashcardId(10L);
            return f;
        });

        FlashcardResponse response = flashcardService.create(1L, request);

        assertNotNull(response);
        assertEquals("hello", response.lemma());
        assertEquals("merhaba", response.translation());
        verify(flashcardRepository).save(any(Flashcard.class));
    }

    @Test
    void create_UserNotFound_ThrowsException() {
        when(userRepository.findById(99L)).thenReturn(Optional.empty());
        FlashcardCreateRequest request = new FlashcardCreateRequest(
                "hello", "merhaba", null, null, KnowledgeStatus.UNKNOWN);

        assertThrows(EntityNotFoundException.class, () -> flashcardService.create(99L, request));
    }

    @Test
    void getById_Success() {
        User user = mockUser();
        Flashcard flashcard = mockFlashcard(user);

        when(flashcardRepository.findById(10L)).thenReturn(Optional.of(flashcard));

        FlashcardResponse response = flashcardService.getById(1L, 10L);

        assertEquals(10L, response.flashcardId());
        assertEquals("hello", response.lemma());
    }

    @Test
    void getById_WrongOwner_ThrowsException() {
        User user = mockUser();
        Flashcard flashcard = mockFlashcard(user);

        when(flashcardRepository.findById(10L)).thenReturn(Optional.of(flashcard));

        assertThrows(EntityNotFoundException.class, () -> flashcardService.getById(999L, 10L));
    }

    @Test
    void update_Success() {
        User user = mockUser();
        Flashcard flashcard = mockFlashcard(user);
        FlashcardUpdateRequest request = new FlashcardUpdateRequest(
                null, "günaydın", null, null, null);

        when(flashcardRepository.findById(10L)).thenReturn(Optional.of(flashcard));
        when(flashcardRepository.save(any(Flashcard.class))).thenReturn(flashcard);

        FlashcardResponse response = flashcardService.update(1L, 10L, request);

        assertEquals("günaydın", response.translation());
        verify(flashcardRepository).save(flashcard);
    }

    @Test
    void delete_Success() {
        User user = mockUser();
        Flashcard flashcard = mockFlashcard(user);

        when(flashcardRepository.findById(10L)).thenReturn(Optional.of(flashcard));

        flashcardService.delete(1L, 10L);

        verify(flashcardRepository).delete(flashcard);
    }

    @Test
    void delete_NotFound_ThrowsException() {
        when(flashcardRepository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(EntityNotFoundException.class, () -> flashcardService.delete(1L, 99L));
        verify(flashcardRepository, never()).delete(any());
    }
}
