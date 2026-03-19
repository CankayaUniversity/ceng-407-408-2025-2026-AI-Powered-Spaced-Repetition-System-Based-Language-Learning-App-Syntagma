package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.CollectionCreateRequest;
import com.syntagma.backend.dto.response.CollectionItemResponse;
import com.syntagma.backend.dto.response.CollectionResponse;
import com.syntagma.backend.entity.Collection;
import com.syntagma.backend.entity.CollectionItem;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.exception.DuplicateResourceException;
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

@Service
@RequiredArgsConstructor
public class CollectionService {

    private final CollectionRepository collectionRepository;
    private final CollectionItemRepository collectionItemRepository;
    private final FlashcardRepository flashcardRepository;
    private final UserRepository userRepository;

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
        return collectionRepository.findByUser_UserId(userId, pageable)
                .map(c -> toResponse(c, List.of()));
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
        return toResponse(collection, itemDtos);
    }

    @Transactional
    public CollectionResponse update(Long userId, Long collectionId, CollectionCreateRequest request) {
        Collection collection = findOwnedCollection(userId, collectionId);
        collection.setName(request.name());
        Collection saved = collectionRepository.save(collection);
        return toResponse(saved, List.of());
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

    private CollectionResponse toResponse(Collection c, List<CollectionItemResponse> items) {
        return new CollectionResponse(
                c.getCollectionId(),
                c.getUser().getUserId(),
                c.getName(),
                c.getCreatedAt(),
                items
        );
    }
}
