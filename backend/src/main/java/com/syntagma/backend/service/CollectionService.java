package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.CollectionCreateRequest;
import com.syntagma.backend.dto.response.CollectionItemResponse;
import com.syntagma.backend.dto.response.CollectionResponse;
import com.syntagma.backend.dto.response.FlashcardResponse;
import com.syntagma.backend.entity.Collection;
import com.syntagma.backend.entity.CollectionItem;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.SrsState;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.exception.DuplicateResourceException;
import com.syntagma.backend.repository.CollectionItemRepository;
import com.syntagma.backend.repository.CollectionRepository;
import com.syntagma.backend.repository.FlashcardRepository;
import com.syntagma.backend.repository.SrsStateRepository;
import com.syntagma.backend.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CollectionService {

    private final CollectionRepository collectionRepository;
    private final CollectionItemRepository collectionItemRepository;
    private final FlashcardRepository flashcardRepository;
    private final SrsStateRepository srsStateRepository;
    private final UserRepository userRepository;

    private static final int DEFAULT_DAILY_NEW_LIMIT = 10;

    @Transactional
    public CollectionResponse create(Long userId, CollectionCreateRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));

        Collection collection = new Collection();
        collection.setUser(user);
        collection.setName(request.name());
        collection.setCreatedAt(LocalDateTime.now());

        Collection saved = collectionRepository.save(collection);
        return toResponse(saved, List.of());
    }

    public Page<CollectionResponse> getAll(Long userId, Pageable pageable) {
        Page<Collection> collections = collectionRepository.findByUser_UserId(userId, pageable);
        Map<Long, CollectionCounts> counts = buildCounts(userId, collections.getContent());
        return collections.map(c -> toResponse(c, List.of(), counts.get(c.getCollectionId())));
    }

    public CollectionResponse getById(Long userId, Long collectionId) {
        Collection collection = findOwnedCollection(userId, collectionId);
        List<CollectionItem> items = collectionItemRepository.findByCollectionId(collectionId);
        List<CollectionItemResponse> itemDtos = items.stream()
                .map(item -> new CollectionItemResponse(
                        item.getFlashcard().getFlashcardId(),
                        item.getFlashcard().getLemma(),
                        item.getFlashcard().getTranslation(),
                        item.getAddedAt()
                )).toList();
        Map<Long, CollectionCounts> counts = buildCounts(userId, List.of(collection));
        return toResponse(collection, itemDtos, counts.get(collectionId));
    }

    public List<FlashcardResponse> getReviewableCards(Long userId, Long collectionId) {
        findOwnedCollection(userId, collectionId);

        Set<Long> collectionCardIds = getCollectionCardIds(userId, collectionId);
        if (collectionCardIds.isEmpty()) {
            return List.of();
        }

        Set<Long> reviewableIds = getReviewableIds(userId);
        List<Long> ids = collectionCardIds.stream()
                .filter(reviewableIds::contains)
                .toList();
        if (ids.isEmpty()) {
            return List.of();
        }

        return flashcardRepository.findByUser_UserIdAndFlashcardIdIn(userId, ids)
                .stream()
                .map(this::toFlashcardResponse)
                .toList();
    }

    @Transactional
    public CollectionResponse update(Long userId, Long collectionId, CollectionCreateRequest request) {
        Collection collection = findOwnedCollection(userId, collectionId);
        collection.setName(request.name());
        Collection saved = collectionRepository.save(collection);
        Map<Long, CollectionCounts> counts = buildCounts(userId, List.of(saved));
        return toResponse(saved, List.of(), counts.get(saved.getCollectionId()));
    }

    @Transactional
    public void delete(Long userId, Long collectionId) {
        Collection collection = findOwnedCollection(userId, collectionId);
        collectionRepository.delete(collection);
    }

    @Transactional
    public CollectionItemResponse addItem(Long userId, Long collectionId, Long flashcardId) {
        findOwnedCollection(userId, collectionId);

        Flashcard flashcard = flashcardRepository.findById(flashcardId)
                .orElseThrow(() -> new EntityNotFoundException("Flashcard not found: " + flashcardId));

        if (collectionItemRepository.existsByCollectionIdAndFlashcardId(collectionId, flashcardId)) {
            throw new DuplicateResourceException("Flashcard already in collection");
        }

        CollectionItem item = new CollectionItem();
        item.setCollectionId(collectionId);
        item.setFlashcardId(flashcardId);
        item.setAddedAt(LocalDateTime.now());

        CollectionItem saved = collectionItemRepository.save(item);
        return new CollectionItemResponse(
                flashcard.getFlashcardId(),
                flashcard.getLemma(),
                flashcard.getTranslation(),
                saved.getAddedAt()
        );
    }

    @Transactional
    public void removeItem(Long userId, Long collectionId, Long flashcardId) {
        findOwnedCollection(userId, collectionId);
        collectionItemRepository.deleteByCollectionIdAndFlashcardId(collectionId, flashcardId);
    }

    private Collection findOwnedCollection(Long userId, Long collectionId) {
        Collection collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new EntityNotFoundException("Collection not found: " + collectionId));
        if (!collection.getUser().getUserId().equals(userId)) {
            throw new EntityNotFoundException("Collection not found: " + collectionId);
        }
        return collection;
    }

    private Map<Long, CollectionCounts> buildCounts(Long userId, List<Collection> collections) {
        Map<Long, CollectionCounts> counts = new HashMap<>();
        if (collections.isEmpty()) {
            return counts;
        }

        Set<Long> reviewableIds = getReviewableIds(userId);

        for (Collection collection : collections) {
            Long collectionId = collection.getCollectionId();
            Set<Long> cardIds = getCollectionCardIds(userId, collectionId);

            int reviewableCount = 0;
            for (Long cardId : cardIds) {
                if (reviewableIds.contains(cardId)) {
                    reviewableCount++;
                }
            }
            counts.put(collectionId, new CollectionCounts(cardIds.size(), reviewableCount));
        }

        return counts;
    }

    private Set<Long> getReviewableIds(Long userId) {
        User user = userRepository.findById(userId).orElse(null);
        int dailyNewLimit = user != null && user.getDailyNewCardLimit() != null
                ? user.getDailyNewCardLimit()
                : DEFAULT_DAILY_NEW_LIMIT;

        Set<Long> reviewableIds = new HashSet<>();
        srsStateRepository.findDueCards(userId, LocalDateTime.now(), KnowledgeStatus.KNOWN)
                .stream()
                .map(SrsState::getFlashcard)
                .filter(flashcard -> flashcard != null && flashcard.getFlashcardId() != null)
                .map(Flashcard::getFlashcardId)
                .forEach(reviewableIds::add);

        flashcardRepository.findNewCards(userId, KnowledgeStatus.KNOWN)
                .stream()
                .limit(Math.max(dailyNewLimit, 0))
                .map(Flashcard::getFlashcardId)
                .filter(id -> id != null)
                .forEach(reviewableIds::add);

        return reviewableIds;
    }

    private Set<Long> getCollectionCardIds(Long userId, Long collectionId) {
        Set<Long> cardIds = new HashSet<>(collectionItemRepository.findFlashcardIdsByCollectionId(collectionId));
        cardIds.addAll(flashcardRepository.findIdsByUserIdAndCollectionId(userId, collectionId));
        return cardIds;
    }

    private CollectionResponse toResponse(Collection c, List<CollectionItemResponse> items) {
        return toResponse(c, items, new CollectionCounts(items.size(), 0));
    }

    private CollectionResponse toResponse(Collection c, List<CollectionItemResponse> items, CollectionCounts counts) {
        CollectionCounts safeCounts = counts != null ? counts : new CollectionCounts(items.size(), 0);
        return new CollectionResponse(
                c.getCollectionId(),
                c.getUser().getUserId(),
                c.getName(),
                c.getCreatedAt(),
                items,
                safeCounts.itemsCount(),
                safeCounts.reviewableCount()
        );
    }

    private FlashcardResponse toFlashcardResponse(Flashcard flashcard) {
        List<Long> collectionIds = collectionItemRepository.findCollectionIdsByFlashcardId(flashcard.getFlashcardId())
                .stream()
                .distinct()
                .collect(Collectors.toList());

        return new FlashcardResponse(
                flashcard.getFlashcardId(),
                flashcard.getUser().getUserId(),
                flashcard.getLemma(),
                flashcard.getTranslation(),
                flashcard.getSourceSentence(),
                flashcard.getExampleSentence(),
                flashcard.getCollection() != null ? flashcard.getCollection().getCollectionId() : null,
                flashcard.getKnowledgeStatus(),
                collectionIds,
                flashcard.getCreatedAt(),
                flashcard.getUpdatedAt()
        );
    }

    private record CollectionCounts(int itemsCount, int reviewableCount) {}
}
