package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.ReviewSubmitRequest;
import com.syntagma.backend.dto.response.ReviewResultResponse;
import com.syntagma.backend.dto.response.SrsStateResponse;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.ReviewLog;
import com.syntagma.backend.entity.SrsState;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.entity.enums.DeviceType;
import com.syntagma.backend.repository.FlashcardRepository;
import com.syntagma.backend.repository.ReviewLogRepository;
import com.syntagma.backend.repository.SrsStateRepository;
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
class ReviewServiceTest {

    @Mock private ReviewLogRepository reviewLogRepository;
    @Mock private FlashcardRepository flashcardRepository;
    @Mock private SrsStateRepository srsStateRepository;
    @Mock private UserRepository userRepository;
    @Mock private SrsService srsService;
    @Mock private FsrsAlgorithm fsrsAlgorithm;
    @InjectMocks private ReviewService reviewService;

    @Test
    void submitReview_Success() {
        User user = new User();
        user.setUserId(1L);

        Flashcard flashcard = new Flashcard();
        flashcard.setFlashcardId(10L);
        flashcard.setUser(user);

        SrsState srsState = new SrsState();
        srsState.setFlashcard(flashcard);
        srsState.setStability(1.0f);
        srsState.setDifficulty(5.0f);
        srsState.setRetrievability(1.0f);

        ReviewLog savedLog = new ReviewLog();
        savedLog.setReviewId(100L);
        savedLog.setFlashcard(flashcard);
        savedLog.setUser(user);
        savedLog.setResult(4);
        savedLog.setReviewedAt(LocalDateTime.now());

        ReviewSubmitRequest request = new ReviewSubmitRequest(10L, 4, DeviceType.MOBILE, LocalDateTime.now());

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(flashcardRepository.findById(10L)).thenReturn(Optional.of(flashcard));
        when(srsStateRepository.findById(10L)).thenReturn(Optional.of(srsState));
        when(reviewLogRepository.save(any(ReviewLog.class))).thenReturn(savedLog);
        when(srsStateRepository.save(any(SrsState.class))).thenReturn(srsState);
        when(srsService.toResponse(any(SrsState.class))).thenReturn(
                new SrsStateResponse(10L, 1.8f, 4.7f, 0.8f, "REVIEW", 2, 0, 2, 2, LocalDateTime.now(), LocalDateTime.now().plusDays(2)));

        ReviewResultResponse response = reviewService.submitReview(1L, request);

        assertNotNull(response);
        assertEquals(100L, response.reviewId());
        assertEquals(4, response.result());
        verify(reviewLogRepository).save(any(ReviewLog.class));
        verify(srsStateRepository).save(any(SrsState.class));
    }

    @Test
    void submitReview_FlashcardNotOwned_ThrowsException() {
        User user = new User();
        user.setUserId(1L);

        User otherUser = new User();
        otherUser.setUserId(2L);

        Flashcard flashcard = new Flashcard();
        flashcard.setFlashcardId(10L);
        flashcard.setUser(otherUser);

        ReviewSubmitRequest request = new ReviewSubmitRequest(10L, 4, DeviceType.MOBILE, LocalDateTime.now());

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(flashcardRepository.findById(10L)).thenReturn(Optional.of(flashcard));

        assertThrows(EntityNotFoundException.class, () -> reviewService.submitReview(1L, request));
        verify(reviewLogRepository, never()).save(any());
    }

    @Test
    void submitReview_CreatesNewSrsState_WhenNoneExists() {
        User user = new User();
        user.setUserId(1L);

        Flashcard flashcard = new Flashcard();
        flashcard.setFlashcardId(10L);
        flashcard.setUser(user);

        ReviewLog savedLog = new ReviewLog();
        savedLog.setReviewId(101L);
        savedLog.setFlashcard(flashcard);
        savedLog.setUser(user);
        savedLog.setResult(3);
        savedLog.setReviewedAt(LocalDateTime.now());

        ReviewSubmitRequest request = new ReviewSubmitRequest(10L, 3, DeviceType.EXTENSION, LocalDateTime.now());

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(flashcardRepository.findById(10L)).thenReturn(Optional.of(flashcard));
        when(srsStateRepository.findById(10L)).thenReturn(Optional.empty());
        when(reviewLogRepository.save(any(ReviewLog.class))).thenReturn(savedLog);
        when(srsStateRepository.save(any(SrsState.class))).thenAnswer(inv -> inv.getArgument(0));
        when(srsService.toResponse(any(SrsState.class))).thenReturn(
                new SrsStateResponse(10L, 1.6f, 5.0f, 0.6f, "REVIEW", 2, 0, 2, 2, LocalDateTime.now(), LocalDateTime.now().plusDays(2)));

        ReviewResultResponse response = reviewService.submitReview(1L, request);

        assertNotNull(response);
        verify(srsStateRepository).save(any(SrsState.class));
    }
}
