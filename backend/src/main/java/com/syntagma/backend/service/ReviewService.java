package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.ReviewSubmitRequest;
import com.syntagma.backend.dto.response.*;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.ReviewLog;
import com.syntagma.backend.entity.SrsState;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.entity.enums.Rating;
import com.syntagma.backend.repository.*;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewLogRepository reviewLogRepository;
    private final FlashcardRepository flashcardRepository;
    private final SrsStateRepository srsStateRepository;
    private final UserRepository userRepository;
    private final SrsService srsService;
    private final FsrsAlgorithm fsrsAlgorithm;

    @Transactional
    public ReviewResultResponse submitReview(Long userId, ReviewSubmitRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));
        Flashcard flashcard = flashcardRepository.findById(request.flashcardId())
                .orElseThrow(() -> new EntityNotFoundException("Flashcard not found: " + request.flashcardId()));

        if (!flashcard.getUser().getUserId().equals(userId)) {
            throw new EntityNotFoundException("Flashcard not found: " + request.flashcardId());
        }

        // Parse the FSRS rating (1=Again, 2=Hard, 3=Good, 4=Easy)
        Rating rating = Rating.fromValue(request.result());

        log.info("Submitting review for userId={}, flashcardId={}, result={}",
                userId, request.flashcardId(), request.result());

        // Create review log
        ReviewLog reviewLog = new ReviewLog();
        reviewLog.setFlashcard(flashcard);
        reviewLog.setUser(user);
        reviewLog.setReviewedAt(LocalDateTime.now());
        reviewLog.setResult(request.result());
        reviewLog.setDevice(request.device());
        reviewLog.setClientTimestamp(request.clientTimestamp());
        ReviewLog savedLog = reviewLogRepository.save(reviewLog);

        // Get or create SRS state
        SrsState srsState = srsStateRepository.findById(flashcard.getFlashcardId())
                .orElseGet(() -> SrsState.createNew(flashcard));

        // Apply the FSRS algorithm
        LocalDateTime now = LocalDateTime.now();
        log.debug("Applying FSRS for flashcardId={}, rating={}", flashcard.getFlashcardId(), rating);
        fsrsAlgorithm.processReview(srsState, rating, now);

        SrsState savedSrs = srsStateRepository.save(srsState);
        log.info("Review saved: reviewId={}, nextReviewAt={}",
                savedLog.getReviewId(), savedSrs.getNextReviewAt());

        return new ReviewResultResponse(
                savedLog.getReviewId(),
                flashcard.getFlashcardId(),
                savedLog.getResult(),
                savedLog.getReviewedAt(),
                srsService.toResponse(savedSrs)
        );
    }

    public Page<ReviewLogResponse> getReviews(Long userId, Long flashcardId,
                                               LocalDateTime startDate, LocalDateTime endDate,
                                               Pageable pageable) {
        if (flashcardId != null) {
            return reviewLogRepository.findByUser_UserIdAndFlashcard_FlashcardId(userId, flashcardId, pageable)
                    .map(this::toResponse);
        }
        if (startDate != null && endDate != null) {
            return reviewLogRepository.findByUserIdAndDateRange(userId, startDate, endDate, pageable)
                    .map(this::toResponse);
        }
        return reviewLogRepository.findByUser_UserId(userId, pageable).map(this::toResponse);
    }

    public ReviewStatsResponse getStats(Long userId, String period) {
        log.info("Fetching review stats for userId={}, period={}", userId, period);
        long totalReviews = reviewLogRepository.countByUser_UserId(userId);
        Double avgResult = reviewLogRepository.findAverageResultByUserId(userId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));

        LocalDateTime now = LocalDateTime.now();
        long weeklyCount  = reviewLogRepository.countByUserIdSince(userId, now.minusWeeks(1));
        long monthlyCount = reviewLogRepository.countByUserIdSince(userId, now.minusMonths(1));
        long yearlyCount  = reviewLogRepository.countByUserIdSince(userId, now.minusYears(1));

        int days = switch (period) {
            case "day"   -> 1;
            case "month" -> 30;
            default      -> 7; // week
        };

        LocalDateTime since = now.minusDays(days);
        List<Object[]> rawCounts = reviewLogRepository.countReviewsByDay(userId, since);
        List<ReviewStatsResponse.DailyReviewCount> dailyCounts = rawCounts.stream()
                .map(row -> new ReviewStatsResponse.DailyReviewCount(
                        row[0].toString(),
                        ((Number) row[1]).longValue()
                ))
                .toList();

        return new ReviewStatsResponse(
                totalReviews,
                weeklyCount,
                monthlyCount,
                yearlyCount,
                user.getStreakCount(),
                avgResult != null ? avgResult : 0.0,
                dailyCounts
        );
    }

    private ReviewLogResponse toResponse(ReviewLog r) {
        return new ReviewLogResponse(
                r.getReviewId(),
                r.getFlashcard().getFlashcardId(),
                r.getUser().getUserId(),
                r.getReviewedAt(),
                r.getResult(),
                r.getDevice(),
                r.getClientTimestamp()
        );
    }
}
