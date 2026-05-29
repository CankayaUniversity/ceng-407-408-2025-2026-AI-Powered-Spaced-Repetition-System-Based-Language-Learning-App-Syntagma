package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.ReviewSubmitRequest;
import com.syntagma.backend.dto.response.*;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.ReviewLog;
import com.syntagma.backend.entity.SrsState;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.entity.enums.Rating;
import com.syntagma.backend.repository.*;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

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
        private final WordKnowledgeService wordKnowledgeService;

        private static final int KNOWN_INTERVAL_DAYS = 25;
        private static final int MIN_SUCCESS_REVIEWS_FOR_KNOWN = 3;

    @Transactional
    public ReviewResultResponse submitReview(Long userId, ReviewSubmitRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));
        Flashcard flashcard = flashcardRepository.findById(request.flashcardId())
                .orElseThrow(() -> new EntityNotFoundException("Flashcard not found: " + request.flashcardId()));

        if (!flashcard.getUser().getUserId().equals(userId)) {
            throw new EntityNotFoundException("Flashcard not found: " + request.flashcardId());
        }

                // Map 2-button UI to FSRS: known -> GOOD(3), unknown -> AGAIN(1)
                Rating rating;
                Integer resultValue;
                if (request.known() != null) {
                        rating = request.known() ? Rating.GOOD : Rating.AGAIN;
                        resultValue = rating.getValue();
                } else if (request.result() != null) {
                        rating = Rating.fromValue(request.result());
                        resultValue = rating.getValue();
                } else {
                        throw new IllegalArgumentException("Either 'known' or 'result' must be provided");
                }

                log.info("Submitting review for userId={}, flashcardId={}, result={}",
                                userId, request.flashcardId(), resultValue);

        LocalDateTime serverNow = LocalDateTime.now();
        ReviewDateContext reviewDate = resolveReviewDate(request, serverNow);

        // Create review log
        ReviewLog reviewLog = new ReviewLog();
        reviewLog.setFlashcard(flashcard);
        reviewLog.setUser(user);
        reviewLog.setReviewedAt(serverNow);
        reviewLog.setReviewedOn(reviewDate.reviewedOn());
        reviewLog.setResult(resultValue);
        reviewLog.setDevice(request.device());
        reviewLog.setClientTimeZone(reviewDate.clientTimeZone());
        if (request.clientTimestamp() != null) {
            reviewLog.setClientTimestamp(reviewDate.clientTimestamp());
        }
        ReviewLog savedLog = reviewLogRepository.save(reviewLog);

        // Get or create SRS state
        SrsState srsState = srsStateRepository.findById(flashcard.getFlashcardId())
                .orElseGet(() -> SrsState.createNew(flashcard));

        // Apply the FSRS algorithm
        LocalDateTime now = serverNow;
        log.debug("Applying FSRS for flashcardId={}, rating={}", flashcard.getFlashcardId(), rating);
        fsrsAlgorithm.processReview(srsState, rating, now);

        SrsState savedSrs = srsStateRepository.save(srsState);
        maybeMarkKnownWord(flashcard, savedSrs, rating);
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

        private void maybeMarkKnownWord(Flashcard flashcard, SrsState srsState, Rating rating) {
                if (flashcard.getKnowledgeStatus() == KnowledgeStatus.KNOWN) {
                        return;
                }
                if (rating == Rating.AGAIN) {
                        return;
                }

                Integer scheduledDays = srsState.getScheduledDays();
                Integer reps = srsState.getReps();
                if (scheduledDays != null
                                && reps != null
                                && scheduledDays > KNOWN_INTERVAL_DAYS
                                && reps >= MIN_SUCCESS_REVIEWS_FOR_KNOWN) {
                        flashcard.setKnowledgeStatus(KnowledgeStatus.KNOWN);
                        flashcard.setUpdatedAt(LocalDateTime.now());
                        flashcardRepository.save(flashcard);
                        wordKnowledgeService.update(
                                        flashcard.getUser().getUserId(),
                                        flashcard.getLemma(),
                                        KnowledgeStatus.KNOWN
                        );
                }
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

    public ReviewStatsResponse getStats(Long userId, String period, String clientTimeZone) {
        log.info("Fetching review stats for userId={}, period={}", userId, period);
        userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));

        ZoneId zone = resolveZoneOrDefault(clientTimeZone);
        LocalDate today = LocalDate.now(zone);
        List<ReviewLog> reviews = reviewLogRepository.findAllByUser_UserId(userId);
        Map<LocalDate, Long> countsByDay = buildCountsByDay(reviews);
        Set<LocalDate> studyDays = new TreeSet<>(countsByDay.keySet());
        LocalDate periodStart = resolvePeriodStart(period, today);

        long weeklyCount = countReviewsOnOrAfter(countsByDay, today.minusDays(6));
        long monthlyCount = countReviewsOnOrAfter(countsByDay, today.minusDays(29));
        long yearlyCount = countReviewsOnOrAfter(countsByDay, today.minusDays(364));
        double avgResult = reviews.stream()
                .map(ReviewLog::getResult)
                .filter(result -> result != null)
                .mapToInt(Integer::intValue)
                .average()
                .orElse(0.0);

        List<ReviewStatsResponse.DailyReviewCount> dailyCounts = countsByDay.entrySet().stream()
                .filter(entry -> periodStart == null || !entry.getKey().isBefore(periodStart))
                .sorted(Map.Entry.<LocalDate, Long>comparingByKey(Comparator.reverseOrder()))
                .map(entry -> new ReviewStatsResponse.DailyReviewCount(
                        entry.getKey().toString(),
                        entry.getValue()
                ))
                .toList();

        return new ReviewStatsResponse(
                reviews.size(),
                weeklyCount,
                monthlyCount,
                yearlyCount,
                computeCurrentStreak(studyDays, today),
                computeLongestStreak(studyDays),
                avgResult,
                dailyCounts
        );
    }

    private ReviewDateContext resolveReviewDate(ReviewSubmitRequest request, LocalDateTime serverNow) {
        ZoneId zone = resolveZone(request.clientTimeZone());
        if (zone == null || request.clientTimestamp() == null) {
            return new ReviewDateContext(serverNow.toLocalDate(), serverNow, null);
        }

        LocalDateTime clientLocalTime = request.clientTimestamp().atZoneSameInstant(zone).toLocalDateTime();
        return new ReviewDateContext(clientLocalTime.toLocalDate(), clientLocalTime, zone.getId());
    }

    private ZoneId resolveZone(String clientTimeZone) {
        if (clientTimeZone == null || clientTimeZone.isBlank()) {
            return null;
        }

        try {
            return ZoneId.of(clientTimeZone);
        } catch (DateTimeException err) {
            return null;
        }
    }

    private ZoneId resolveZoneOrDefault(String clientTimeZone) {
        ZoneId zone = resolveZone(clientTimeZone);
        return zone != null ? zone : ZoneId.systemDefault();
    }

    private Map<LocalDate, Long> buildCountsByDay(List<ReviewLog> reviews) {
        Map<LocalDate, Long> countsByDay = new HashMap<>();
        for (ReviewLog review : reviews) {
            LocalDate reviewedOn = getEffectiveReviewDate(review);
            if (reviewedOn != null) {
                countsByDay.merge(reviewedOn, 1L, Long::sum);
            }
        }
        return countsByDay;
    }

    private LocalDate getEffectiveReviewDate(ReviewLog review) {
        if (review.getReviewedOn() != null) {
            return review.getReviewedOn();
        }
        if (review.getClientTimestamp() != null) {
            return review.getClientTimestamp().toLocalDate();
        }
        if (review.getReviewedAt() != null) {
            return review.getReviewedAt().toLocalDate();
        }
        return null;
    }

    private LocalDate resolvePeriodStart(String period, LocalDate today) {
        return switch (period == null ? "week" : period.toLowerCase()) {
            case "day" -> today;
            case "month" -> today.minusDays(29);
            case "year" -> today.minusDays(364);
            case "all" -> null;
            default -> today.minusDays(6);
        };
    }

    private long countReviewsOnOrAfter(Map<LocalDate, Long> countsByDay, LocalDate start) {
        return countsByDay.entrySet().stream()
                .filter(entry -> !entry.getKey().isBefore(start))
                .mapToLong(Map.Entry::getValue)
                .sum();
    }

    private int computeCurrentStreak(Set<LocalDate> studyDays, LocalDate today) {
        if (studyDays.isEmpty()) {
            return 0;
        }

        LocalDate cursor;
        if (studyDays.contains(today)) {
            cursor = today;
        } else if (studyDays.contains(today.minusDays(1))) {
            cursor = today.minusDays(1);
        } else {
            return 0;
        }

        int streak = 0;
        while (studyDays.contains(cursor)) {
            streak += 1;
            cursor = cursor.minusDays(1);
        }
        return streak;
    }

    private int computeLongestStreak(Set<LocalDate> studyDays) {
        int longest = 0;
        int current = 0;
        LocalDate previous = null;

        for (LocalDate day : studyDays) {
            if (previous == null || day.equals(previous.plusDays(1))) {
                current += 1;
            } else {
                current = 1;
            }
            longest = Math.max(longest, current);
            previous = day;
        }

        return longest;
    }

    private record ReviewDateContext(
            LocalDate reviewedOn,
            LocalDateTime clientTimestamp,
            String clientTimeZone
    ) {}

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
