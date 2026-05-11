package com.syntagma.backend.repository;

import com.syntagma.backend.entity.CollectionItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface CollectionItemRepository extends JpaRepository<CollectionItem, CollectionItem.CollectionItemId> {
    List<CollectionItem> findByCollectionId(Long collectionId);
    List<CollectionItem> findByFlashcardIdIn(List<Long> flashcardIds);
    boolean existsByCollectionIdAndFlashcardId(Long collectionId, Long flashcardId);
    void deleteByCollectionIdAndFlashcardId(Long collectionId, Long flashcardId);

    @Query("SELECT ci.collectionId FROM CollectionItem ci WHERE ci.flashcardId = :flashcardId")
    List<Long> findCollectionIdsByFlashcardId(@Param("flashcardId") Long flashcardId);
}
