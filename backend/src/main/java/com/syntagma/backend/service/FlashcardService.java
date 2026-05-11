package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.FlashcardCreateRequest;
import com.syntagma.backend.dto.request.FlashcardUpdateRequest;
import com.syntagma.backend.dto.response.FlashcardResponse;
import com.syntagma.backend.entity.Collection;
import com.syntagma.backend.entity.CollectionItem;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.repository.CollectionItemRepository;
import com.syntagma.backend.repository.CollectionRepository;
import com.syntagma.backend.repository.FlashcardRepository;
import com.syntagma.backend.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class FlashcardService {

    private final CollectionItemRepository collectionItemRepository;
    private final FlashcardRepository flashcardRepository;
    private final UserRepository userRepository;
    private final CollectionRepository collectionRepository;

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
        if (request.collectionId() != null) {
            flashcard.setCollection(findOwnedCollection(userId, request.collectionId()));
        }
        flashcard.setKnowledgeStatus(request.knowledgeStatus());
        flashcard.setCreatedAt(LocalDateTime.now());
        flashcard.setUpdatedAt(LocalDateTime.now());

        Flashcard saved = flashcardRepository.save(flashcard);
        return toResponse(saved);
    }

    public Page<FlashcardResponse> getAll(Long userId, KnowledgeStatus status, String search, Pageable pageable) {
        Page<Flashcard> page;
        if (search != null && !search.isBlank()) {
            page = flashcardRepository.searchByUserIdAndTerm(userId, search, pageable);
        } else if (status != null) {
            page = flashcardRepository.findByUser_UserIdAndKnowledgeStatus(userId, status, pageable);
        } else {
            page = flashcardRepository.findByUser_UserId(userId, pageable);
        }

        Map<Long, List<Long>> collectionIdsByFlashcardId = loadCollectionIds(page.getContent());
        return page.map(f -> toResponse(f, collectionIdsByFlashcardId.getOrDefault(f.getFlashcardId(), List.of())));
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
        if (Boolean.TRUE.equals(request.clearCollection())) {
            flashcard.setCollection(null);
        } else if (request.collectionId() != null) {
            flashcard.setCollection(findOwnedCollection(userId, request.collectionId()));
        }
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
        List<Long> collectionIds = collectionItemRepository.findCollectionIdsByFlashcardId(f.getFlashcardId());
        return toResponse(f, collectionIds);
    }

    private FlashcardResponse toResponse(Flashcard f, List<Long> collectionIds) {
        return new FlashcardResponse(
                f.getFlashcardId(),
                f.getUser().getUserId(),
                f.getLemma(),
                f.getTranslation(),
                f.getSourceSentence(),
                f.getExampleSentence(),
                f.getCollection() != null ? f.getCollection().getCollectionId() : null,
                f.getKnowledgeStatus(),
                collectionIds,
                f.getCreatedAt(),
                f.getUpdatedAt()
        );
    }

    private Map<Long, List<Long>> loadCollectionIds(List<Flashcard> flashcards) {
        if (flashcards.isEmpty()) {
            return Map.of();
        }

        List<Long> flashcardIds = flashcards.stream()
                .map(Flashcard::getFlashcardId)
                .toList();

        List<CollectionItem> items = collectionItemRepository.findByFlashcardIdIn(flashcardIds);
        return items.stream()
                .collect(Collectors.groupingBy(
                        CollectionItem::getFlashcardId,
                        Collectors.mapping(CollectionItem::getCollectionId, Collectors.toList())
                ));
    }

    private Collection findOwnedCollection(Long userId, Long collectionId) {
        Collection collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new EntityNotFoundException("Collection not found: " + collectionId));
        if (!collection.getUser().getUserId().equals(userId)) {
            throw new EntityNotFoundException("Collection not found: " + collectionId);
        }
        return collection;
    }
}
