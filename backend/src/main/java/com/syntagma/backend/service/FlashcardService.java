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
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class FlashcardService {

    private final FlashcardRepository flashcardRepository;
    private final UserRepository userRepository;

    @Transactional
    public FlashcardResponse create(Long userId, FlashcardCreateRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));

        Flashcard flashcard = new Flashcard();
        flashcard.setUser(user);
        flashcard.setLemma(request.lemma());
        flashcard.setTranslation(request.translation());
        flashcard.setSourceSentence(request.sourceSentence());
        flashcard.setExampleSentence(request.exampleSentence());
        flashcard.setKnowledgeStatus(request.knowledgeStatus());
        flashcard.setCreatedAt(LocalDateTime.now());
        flashcard.setUpdatedAt(LocalDateTime.now());

        Flashcard saved = flashcardRepository.save(flashcard);
        return toResponse(saved);
    }

    public Page<FlashcardResponse> getAll(Long userId, KnowledgeStatus status, String search, Pageable pageable) {
        if (search != null && !search.isBlank()) {
            return flashcardRepository.searchByUserIdAndTerm(userId, search, pageable).map(this::toResponse);
        }
        if (status != null) {
            return flashcardRepository.findByUser_UserIdAndKnowledgeStatus(userId, status, pageable).map(this::toResponse);
        }
        return flashcardRepository.findByUser_UserId(userId, pageable).map(this::toResponse);
    }

    public FlashcardResponse getById(Long userId, Long flashcardId) {
        Flashcard flashcard = findOwnedFlashcard(userId, flashcardId);
        return toResponse(flashcard);
    }

    @Transactional
    public FlashcardResponse update(Long userId, Long flashcardId, FlashcardUpdateRequest request) {
        Flashcard flashcard = findOwnedFlashcard(userId, flashcardId);

        if (request.lemma() != null) flashcard.setLemma(request.lemma());
        if (request.translation() != null) flashcard.setTranslation(request.translation());
        if (request.sourceSentence() != null) flashcard.setSourceSentence(request.sourceSentence());
        if (request.exampleSentence() != null) flashcard.setExampleSentence(request.exampleSentence());
        if (request.knowledgeStatus() != null) flashcard.setKnowledgeStatus(request.knowledgeStatus());
        flashcard.setUpdatedAt(LocalDateTime.now());

        Flashcard saved = flashcardRepository.save(flashcard);
        return toResponse(saved);
    }

    @Transactional
    public void delete(Long userId, Long flashcardId) {
        Flashcard flashcard = findOwnedFlashcard(userId, flashcardId);
        flashcardRepository.delete(flashcard);
    }

    private Flashcard findOwnedFlashcard(Long userId, Long flashcardId) {
        Flashcard flashcard = flashcardRepository.findById(flashcardId)
                .orElseThrow(() -> new EntityNotFoundException("Flashcard not found: " + flashcardId));
        if (!flashcard.getUser().getUserId().equals(userId)) {
            throw new EntityNotFoundException("Flashcard not found: " + flashcardId);
        }
        return flashcard;
    }

    private FlashcardResponse toResponse(Flashcard f) {
        return new FlashcardResponse(
                f.getFlashcardId(),
                f.getUser().getUserId(),
                f.getLemma(),
                f.getTranslation(),
                f.getSourceSentence(),
                f.getExampleSentence(),
                f.getKnowledgeStatus(),
                f.getCreatedAt(),
                f.getUpdatedAt()
        );
    }
}
