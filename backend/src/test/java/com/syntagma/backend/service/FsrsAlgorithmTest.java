package com.syntagma.backend.service;

import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.SrsState;
import com.syntagma.backend.entity.enums.CardState;
import com.syntagma.backend.entity.enums.Rating;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

class FsrsAlgorithmTest {

    private FsrsAlgorithm fsrs;
    private Flashcard mockFlashcard;
    private LocalDateTime now;

    @BeforeEach
    void setUp() {
        fsrs = new FsrsAlgorithm();
        mockFlashcard = new Flashcard();
        mockFlashcard.setFlashcardId(1L);
        now = LocalDateTime.of(2025, 1, 1, 12, 0); // Fixed time for deterministic tests
    }

    @Test
    void testNewCardWithGoodRating() {
        // Arrange
        SrsState state = SrsState.createNew(mockFlashcard);

        // Act
        fsrs.processReview(state, Rating.GOOD, now);

        // Assert
        assertEquals(CardState.LEARNING.name(), state.getState());
        assertEquals(1, state.getReps());
        assertEquals(0, state.getLapses());
        assertEquals(0, state.getScheduledDays());
        
        // Good rating on New card means next review is in 10 minutes
        assertEquals(now.plusMinutes(10), state.getNextReviewAt());
        
        // FSRS initial stability for GOOD (w2)
        assertEquals(3.1262f, state.getStability(), 0.001);
    }

    @Test
    void testNewCardWithEasyRating() {
        // Arrange
        SrsState state = SrsState.createNew(mockFlashcard);

        // Act
        fsrs.processReview(state, Rating.EASY, now);

        // Assert
        assertEquals(CardState.REVIEW.name(), state.getState()); // EASY graduates immediately
        assertEquals(1, state.getReps());
        
        // Initial stability for EASY (w3) = 15.4722
        // Interval is calculated based on stability ~ 15 days
        assertTrue(state.getScheduledDays() > 0);
        assertEquals(now.plusDays(state.getScheduledDays()), state.getNextReviewAt());
    }

    @Test
    void testLearningCardGraduatingToReview() {
        // Arrange
        SrsState state = SrsState.createNew(mockFlashcard);
        fsrs.processReview(state, Rating.GOOD, now); // Initial review -> LEARNING
        
        // Second review 10 minutes later (simulated)
        LocalDateTime later = now.plusMinutes(10);
        
        // Act
        fsrs.processReview(state, Rating.GOOD, later);

        // Assert
        assertEquals(CardState.REVIEW.name(), state.getState()); // Graduated!
        assertEquals(2, state.getReps());
        assertTrue(state.getScheduledDays() >= 1, "Interval should be at least 1 day for graduated card");
        assertEquals(later.plusDays(state.getScheduledDays()), state.getNextReviewAt());
    }

    @Test
    void testReviewCardForgotten() {
        // Arrange
        SrsState state = SrsState.createNew(mockFlashcard);
        fsrs.processReview(state, Rating.EASY, now); // Graduated to REVIEW
        
        // Simulate reviewing the card 15 days later and forgetting it
        LocalDateTime muchLater = now.plusDays(15);
        state.setLastReviewedAt(now); 
        
        // Act
        fsrs.processReview(state, Rating.AGAIN, muchLater);

        // Assert
        assertEquals(CardState.RELEARNING.name(), state.getState());
        assertEquals(2, state.getReps());
        assertEquals(1, state.getLapses(), "Lapses should increment on AGAIN for a REVIEW card");
        assertEquals(0, state.getScheduledDays());
        assertEquals(muchLater.plusMinutes(5), state.getNextReviewAt());
        
        // Stability should drop significantly after forgetting
        assertTrue(state.getStability() < 5.0f, "Stability should drop after lapse");
    }
}
