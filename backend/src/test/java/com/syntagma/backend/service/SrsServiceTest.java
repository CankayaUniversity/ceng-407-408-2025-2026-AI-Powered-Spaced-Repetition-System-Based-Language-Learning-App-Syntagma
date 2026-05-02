package com.syntagma.backend.service;

import com.syntagma.backend.dto.response.DueCardsResponse;
import com.syntagma.backend.dto.response.SrsStateResponse;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.SrsState;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.repository.FlashcardRepository;
import com.syntagma.backend.repository.SrsStateRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SrsServiceTest {

    @Mock private SrsStateRepository srsStateRepository;
    @Mock private FlashcardRepository flashcardRepository;
    @InjectMocks private SrsService srsService;

    @Test
    void getSrsState_Success() {
        User user = new User();
        user.setUserId(1L);

        Flashcard flashcard = new Flashcard();
        flashcard.setFlashcardId(10L);
        flashcard.setUser(user);

        SrsState state = new SrsState();
        state.setFlashcardId(10L);
        state.setFlashcard(flashcard);
        state.setStability(2.5f);
        state.setDifficulty(4.0f);
        state.setRetrievable(0.9f);
        state.setLastReviewedAt(LocalDateTime.now().minusDays(1));
        state.setNextReviewAt(LocalDateTime.now().plusDays(2));

        when(flashcardRepository.findById(10L)).thenReturn(Optional.of(flashcard));
        when(srsStateRepository.findById(10L)).thenReturn(Optional.of(state));

        SrsStateResponse response = srsService.getSrsState(1L, 10L);

        assertEquals(10L, response.flashcardId());
        assertEquals(2.5f, response.stability());
        assertEquals(4.0f, response.difficulty());
    }

    @Test
    void getSrsState_WrongOwner_ThrowsException() {
        User user = new User();
        user.setUserId(2L);

        Flashcard flashcard = new Flashcard();
        flashcard.setFlashcardId(10L);
        flashcard.setUser(user);

        when(flashcardRepository.findById(10L)).thenReturn(Optional.of(flashcard));

        assertThrows(EntityNotFoundException.class, () -> srsService.getSrsState(1L, 10L));
    }

    @Test
    void getDueCards_ReturnsLimitedResults() {
        User user = new User();
        user.setUserId(1L);

        Flashcard f1 = new Flashcard();
        f1.setFlashcardId(1L);
        f1.setLemma("word1");
        f1.setTranslation("trans1");
        f1.setUser(user);

        Flashcard f2 = new Flashcard();
        f2.setFlashcardId(2L);
        f2.setLemma("word2");
        f2.setTranslation("trans2");
        f2.setUser(user);

        SrsState s1 = new SrsState();
        s1.setFlashcard(f1);
        s1.setNextReviewAt(LocalDateTime.now().minusHours(1));
        s1.setStability(1.5f);
        s1.setDifficulty(3.0f);

        SrsState s2 = new SrsState();
        s2.setFlashcard(f2);
        s2.setNextReviewAt(LocalDateTime.now().minusHours(2));
        s2.setStability(2.0f);
        s2.setDifficulty(4.0f);

        when(srsStateRepository.findDueCards(eq(1L), any(LocalDateTime.class)))
                .thenReturn(List.of(s1, s2));

        DueCardsResponse response = srsService.getDueCards(1L, 1);

        assertEquals(1, response.dueCount());
        assertEquals("word1", response.cards().get(0).lemma());
    }

    @Test
    void getDueCards_EmptyResults() {
        when(srsStateRepository.findDueCards(eq(1L), any(LocalDateTime.class)))
                .thenReturn(List.of());

        DueCardsResponse response = srsService.getDueCards(1L, 20);

        assertEquals(0, response.dueCount());
        assertTrue(response.cards().isEmpty());
    }
}
