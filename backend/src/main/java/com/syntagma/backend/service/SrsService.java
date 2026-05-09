package com.syntagma.backend.service;

import com.syntagma.backend.dto.response.DailyCardsResponse;
import com.syntagma.backend.dto.response.DueCardsResponse;
import com.syntagma.backend.dto.response.SrsStateResponse;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.SrsState;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.repository.FlashcardRepository;
import com.syntagma.backend.repository.SrsStateRepository;
import com.syntagma.backend.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SrsService {

    private final SrsStateRepository srsStateRepository;
    private final FlashcardRepository flashcardRepository;
    private final UserRepository userRepository;

    private static final int DEFAULT_DAILY_NEW_LIMIT = 10;

    public SrsStateResponse getSrsState(Long userId, Long flashcardId) {
        Flashcard flashcard = flashcardRepository.findById(flashcardId)
                .orElseThrow(() -> new EntityNotFoundException("Flashcard not found: " + flashcardId));
        if (!flashcard.getUser().getUserId().equals(userId)) {
            throw new EntityNotFoundException("Flashcard not found: " + flashcardId);
        }

        SrsState state = srsStateRepository.findById(flashcardId)
                .orElseThrow(() -> new EntityNotFoundException("SRS state not found for flashcard: " + flashcardId));

        return toResponse(state);
    }

    public DueCardsResponse getDueCards(Long userId, int limit) {
        List<SrsState> dueStates = srsStateRepository.findDueCards(
            userId,
            LocalDateTime.now(),
            KnowledgeStatus.KNOWN
        );

        List<DueCardsResponse.DueCardItem> cards = dueStates.stream()
                .limit(limit)
                .map(s -> new DueCardsResponse.DueCardItem(
                        s.getFlashcard().getFlashcardId(),
                        s.getFlashcard().getLemma(),
                        s.getFlashcard().getTranslation(),
                        s.getNextReviewAt(),
                        s.getStability(),
                        s.getDifficulty(),
                        s.getState(),
                        s.getReps(),
                        s.getLapses()
                ))
                .toList();

        return new DueCardsResponse(cards.size(), cards);
    }

        public DailyCardsResponse getDailyCards(Long userId, Integer newLimit) {
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));
            int effectiveLimit = newLimit != null
                    ? newLimit
                    : (user.getDailyNewCardLimit() != null ? user.getDailyNewCardLimit() : DEFAULT_DAILY_NEW_LIMIT);

            LocalDateTime now = LocalDateTime.now();
            List<SrsState> dueStates = srsStateRepository.findDueCards(userId, now, KnowledgeStatus.KNOWN);
            List<Flashcard> newCards = flashcardRepository.findNewCards(userId, KnowledgeStatus.KNOWN);

        List<DailyCardsResponse.DailyCardItem> dueItems = dueStates.stream()
            .map(s -> new DailyCardsResponse.DailyCardItem(
                s.getFlashcard().getFlashcardId(),
                s.getFlashcard().getLemma(),
                s.getFlashcard().getTranslation(),
                "DUE",
                s.getNextReviewAt(),
                s.getStability(),
                s.getDifficulty(),
                s.getState(),
                s.getReps(),
                s.getLapses()
            ))
            .toList();

        List<DailyCardsResponse.DailyCardItem> newItems = newCards.stream()
            .limit(effectiveLimit)
            .map(f -> new DailyCardsResponse.DailyCardItem(
                f.getFlashcardId(),
                f.getLemma(),
                f.getTranslation(),
                "NEW",
                null,
                null,
                null,
                "NEW",
                0,
                0
            ))
            .toList();

        List<DailyCardsResponse.DailyCardItem> all = new java.util.ArrayList<>(dueItems.size() + newItems.size());
        all.addAll(dueItems);
        all.addAll(newItems);

        return new DailyCardsResponse(dueItems.size(), newItems.size(), all);
        }

    public SrsStateResponse toResponse(SrsState state) {
        return new SrsStateResponse(
                state.getFlashcardId(),
                state.getStability(),
                state.getDifficulty(),
                state.getRetrievability(),
                state.getState(),
                state.getReps(),
                state.getLapses(),
                state.getScheduledDays(),
                state.getElapsedDays(),
                state.getLastReviewedAt(),
                state.getNextReviewAt()
        );
    }
}
