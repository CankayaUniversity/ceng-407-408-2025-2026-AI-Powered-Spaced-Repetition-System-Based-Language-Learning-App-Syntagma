package com.syntagma.backend.repository;

import com.syntagma.backend.entity.MediaAsset;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface MediaAssetRepository extends JpaRepository<MediaAsset, Long> {
    List<MediaAsset> findByFlashcard_FlashcardId(Long flashcardId);
}
