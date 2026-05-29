package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.ReviewSubmitRequest;
import com.syntagma.backend.dto.response.ReviewResultResponse;
import com.syntagma.backend.dto.response.ReviewStatsResponse;
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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReviewServiceTest {

    @Mock private ReviewLogRepository reviewLogRepository;
    @Mock private FlashcardRepository flashcardRepository;
    @Mock private SrsStateRepository srsStateRepository;
    @Mock private UserRepository userRepository;
    @Mock private SrsService srsService;
    @Mock private FsrsAlgorithm fsrsAlgorithm;
    @Mock private WordKnowledgeService wordKnowledgeService;
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

        ReviewSubmitRequest request = new ReviewSubmitRequest(
                10L,
                null,
                4,
                DeviceType.MOBILE,
                OffsetDateTime.parse("2026-05-16T22:30:00Z"),
                "Europe/Istanbul"
        );

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
        var reviewCaptor = org.mockito.ArgumentCaptor.forClass(ReviewLog.class);
        verify(reviewLogRepository).save(reviewCaptor.capture());
        assertEquals(LocalDate.of(2026, 5, 17), reviewCaptor.getValue().getReviewedOn());
        assertEquals("Europe/Istanbul", reviewCaptor.getValue().getClientTimeZone());
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

        ReviewSubmitRequest request = new ReviewSubmitRequest(10L, null, 4, DeviceType.MOBILE, OffsetDateTime.now(), "Europe/Istanbul");

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

        ReviewSubmitRequest request = new ReviewSubmitRequest(10L, null, 3, DeviceType.EXTENSION, OffsetDateTime.now(), "Europe/Istanbul");

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

    @Test
    void getStats_ReturnsWeeklyMonthlyYearlyCounts() {
        User user = new User();
        user.setUserId(1L);

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(reviewLogRepository.findAllByUser_UserId(1L)).thenReturn(java.util.List.of(
                reviewOn(LocalDate.now(ZoneId.of("Europe/Istanbul")).minusDays(1), 4),
                reviewOn(LocalDate.now(ZoneId.of("Europe/Istanbul")).minusDays(10), 3),
                reviewOn(LocalDate.now(ZoneId.of("Europe/Istanbul")).minusDays(40), 2)
        ));

        ReviewStatsResponse stats = reviewService.getStats(1L, "all", "Europe/Istanbul");

        assertNotNull(stats);
        assertEquals(3L, stats.totalReviews());
        assertEquals(1L, stats.weeklyCount());
        assertEquals(2L, stats.monthlyCount());
        assertEquals(3L, stats.yearlyCount());
        assertEquals(1, stats.streakCount());
        assertEquals(1, stats.longestStreakCount());
        assertEquals(3.0, stats.averageResult());
        assertEquals(3, stats.reviewsByDay().size());
    }

    @Test
    void getStats_UserNotFound_ThrowsException() {
        when(userRepository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(jakarta.persistence.EntityNotFoundException.class,
                () -> reviewService.getStats(99L, "week", "Europe/Istanbul"));
    }

    @Test
    void getStats_CurrentStreakCountsTodayAndPreviousDays() {
        User user = new User();
        user.setUserId(1L);
        LocalDate today = LocalDate.now(ZoneId.of("Europe/Istanbul"));

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(reviewLogRepository.findAllByUser_UserId(1L)).thenReturn(java.util.List.of(
                reviewOn(today, 4),
                reviewOn(today.minusDays(1), 3),
                reviewOn(today.minusDays(2), 3)
        ));

        ReviewStatsResponse stats = reviewService.getStats(1L, "week", "Europe/Istanbul");

        assertEquals(3, stats.streakCount());
        assertEquals(3, stats.longestStreakCount());
    }

    @Test
    void getStats_CurrentStreakAllowsYesterdayWhenTodayHasNoReview() {
        User user = new User();
        user.setUserId(1L);
        LocalDate today = LocalDate.now(ZoneId.of("Europe/Istanbul"));

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(reviewLogRepository.findAllByUser_UserId(1L)).thenReturn(java.util.List.of(
                reviewOn(today.minusDays(1), 4),
                reviewOn(today.minusDays(2), 3)
        ));

        ReviewStatsResponse stats = reviewService.getStats(1L, "week", "Europe/Istanbul");

        assertEquals(2, stats.streakCount());
        assertEquals(2, stats.longestStreakCount());
    }

    @Test
    void getStats_CurrentStreakReturnsZeroAfterGap() {
        User user = new User();
        user.setUserId(1L);
        LocalDate today = LocalDate.now(ZoneId.of("Europe/Istanbul"));

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(reviewLogRepository.findAllByUser_UserId(1L)).thenReturn(java.util.List.of(
                reviewOn(today.minusDays(2), 4),
                reviewOn(today.minusDays(3), 3)
        ));

        ReviewStatsResponse stats = reviewService.getStats(1L, "week", "Europe/Istanbul");

        assertEquals(0, stats.streakCount());
        assertEquals(2, stats.longestStreakCount());
    }

    @Test
    void getStats_LongestStreakFindsHistoricalRunAndDeduplicatesDays() {
        User user = new User();
        user.setUserId(1L);

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(reviewLogRepository.findAllByUser_UserId(1L)).thenReturn(java.util.List.of(
                reviewOn(LocalDate.of(2026, 5, 17), 4),
                reviewOn(LocalDate.of(2026, 5, 18), 3),
                reviewOn(LocalDate.of(2026, 5, 18), 2),
                reviewOn(LocalDate.of(2026, 5, 19), 4),
                reviewOn(LocalDate.of(2026, 5, 20), 3),
                reviewOn(LocalDate.of(2026, 5, 25), 4)
        ));

        ReviewStatsResponse stats = reviewService.getStats(1L, "all", "Europe/Istanbul");

        assertEquals(4, stats.longestStreakCount());
        assertEquals(5, stats.reviewsByDay().size());
    }

    private ReviewLog reviewOn(LocalDate reviewedOn, Integer result) {
        ReviewLog log = new ReviewLog();
        log.setReviewedOn(reviewedOn);
        log.setReviewedAt(reviewedOn.atStartOfDay());
        log.setResult(result);
        return log;
    }
}
