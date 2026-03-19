package com.syntagma.backend.repository;

import com.syntagma.backend.entity.CollectionItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CollectionItemRepository extends JpaRepository<CollectionItem, CollectionItem.CollectionItemId> {
    List<CollectionItem> findByCollectionId(Long collectionId);
    boolean existsByCollectionIdAndFlashcardId(Long collectionId, Long flashcardId);
    void deleteByCollectionIdAndFlashcardId(Long collectionId, Long flashcardId);
}
