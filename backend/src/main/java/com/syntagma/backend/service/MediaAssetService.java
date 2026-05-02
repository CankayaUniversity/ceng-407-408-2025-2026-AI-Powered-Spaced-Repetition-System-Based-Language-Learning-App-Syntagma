package com.syntagma.backend.service;

import com.syntagma.backend.dto.response.MediaAssetResponse;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.MediaAsset;
import com.syntagma.backend.entity.enums.MediaType;
import com.syntagma.backend.repository.FlashcardRepository;
import com.syntagma.backend.repository.MediaAssetRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class MediaAssetService {

    private final MediaAssetRepository mediaAssetRepository;
    private final FlashcardRepository flashcardRepository;

    @Transactional
    public MediaAssetResponse upload(Long userId, Long flashcardId, MultipartFile file, MediaType type) {
        Flashcard flashcard = flashcardRepository.findById(flashcardId)
                .orElseThrow(() -> new EntityNotFoundException("Flashcard not found: " + flashcardId));
        if (!flashcard.getUser().getUserId().equals(userId)) {
            throw new EntityNotFoundException("Flashcard not found: " + flashcardId);
        }

        // TODO: Integrate with actual storage (S3, local filesystem, etc.)
        String storageKey = "media/" + type.name().toLowerCase() + "/" + file.getOriginalFilename();

        MediaAsset asset = new MediaAsset();
        asset.setFlashcard(flashcard);
        asset.setType(type);
        asset.setStorageKey(storageKey);
        asset.setMimeType(file.getContentType());
        asset.setCreatedAt(LocalDateTime.now());

        MediaAsset saved = mediaAssetRepository.save(asset);
        return toResponse(saved);
    }

    public List<MediaAssetResponse> getByFlashcard(Long userId, Long flashcardId) {
        Flashcard flashcard = flashcardRepository.findById(flashcardId)
                .orElseThrow(() -> new EntityNotFoundException("Flashcard not found: " + flashcardId));
        if (!flashcard.getUser().getUserId().equals(userId)) {
            throw new EntityNotFoundException("Flashcard not found: " + flashcardId);
        }

        return mediaAssetRepository.findByFlashcard_FlashcardId(flashcardId)
                .stream().map(this::toResponse).toList();
    }

    public MediaAssetResponse getById(Long mediaId) {
        MediaAsset asset = mediaAssetRepository.findById(mediaId)
                .orElseThrow(() -> new EntityNotFoundException("Media asset not found: " + mediaId));
        return toResponse(asset);
    }

    @Transactional
    public void delete(Long mediaId) {
        MediaAsset asset = mediaAssetRepository.findById(mediaId)
                .orElseThrow(() -> new EntityNotFoundException("Media asset not found: " + mediaId));
        // TODO: Delete from storage
        mediaAssetRepository.delete(asset);
    }

    private MediaAssetResponse toResponse(MediaAsset a) {
        return new MediaAssetResponse(
                a.getMediaId(),
                a.getFlashcard().getFlashcardId(),
                a.getType(),
                a.getStorageKey(),
                a.getMimeType(),
                a.getCreatedAt()
        );
    }
}
