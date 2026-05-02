package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.MediaCreateRequest;
import com.syntagma.backend.dto.request.MediaPresignRequest;
import com.syntagma.backend.dto.response.MediaAssetResponse;
import com.syntagma.backend.dto.response.MediaPresignResponse;
import com.syntagma.backend.dto.response.MediaUrlResponse;
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
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MediaAssetService {

    private final MediaAssetRepository mediaAssetRepository;
    private final FlashcardRepository flashcardRepository;
    private final StorageService storageService;

    @Transactional
    public MediaAssetResponse upload(Long userId, Long flashcardId, MultipartFile file, MediaType type) {
        Flashcard flashcard = getOwnedFlashcard(userId, flashcardId);

        // TODO: Integrate with actual storage (S3, local filesystem, etc.)
        String storageKey = "media/" + type.name().toLowerCase() + "/" + file.getOriginalFilename();

        MediaAsset asset = new MediaAsset();
        asset.setFlashcard(flashcard);
        asset.setType(type);
        asset.setStorageKey(storageKey);
        asset.setMimeType(file.getContentType());
        asset.setOriginalFileName(file.getOriginalFilename());
        asset.setSizeBytes(file.getSize());
        asset.setCreatedAt(LocalDateTime.now());

        MediaAsset saved = mediaAssetRepository.save(asset);
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<MediaAssetResponse> getByFlashcard(Long userId, Long flashcardId) {
        getOwnedFlashcard(userId, flashcardId);

        return mediaAssetRepository.findByFlashcard_FlashcardId(flashcardId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public MediaAssetResponse getById(Long userId, Long mediaId) {
        MediaAsset asset = getOwnedMediaAsset(userId, mediaId);
        return toResponse(asset);
    }

    @Transactional
    public MediaPresignResponse createPresignedUpload(Long userId, MediaPresignRequest request) {
        getOwnedFlashcard(userId, request.flashcardId());

        String objectKey = buildObjectKey(userId, request.flashcardId(), request.type(), request.fileName());
        StoragePresignResult presign = storageService.createPresignedUpload(objectKey, request.contentType());

        return new MediaPresignResponse(
                presign.url(),
                objectKey,
                presign.expiresAt()
        );
    }

    @Transactional
    public MediaAssetResponse createMediaAsset(Long userId, MediaCreateRequest request) {
        Flashcard flashcard = getOwnedFlashcard(userId, request.flashcardId());
        validateObjectKey(userId, request.flashcardId(), request.objectKey());

        MediaAsset asset = new MediaAsset();
        asset.setFlashcard(flashcard);
        asset.setType(request.type());
        asset.setStorageKey(request.objectKey());
        asset.setMimeType(request.contentType());
        asset.setOriginalFileName(request.originalFileName());
        asset.setSizeBytes(request.size());
        asset.setCreatedAt(LocalDateTime.now());

        MediaAsset saved = mediaAssetRepository.save(asset);
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public MediaUrlResponse getDownloadUrl(Long userId, Long mediaId) {
        MediaAsset asset = getOwnedMediaAsset(userId, mediaId);
        StoragePresignResult presign = storageService.createPresignedDownload(asset.getStorageKey());
        return new MediaUrlResponse(presign.url(), presign.expiresAt());
    }

    @Transactional
    public void delete(Long userId, Long mediaId) {
        MediaAsset asset = getOwnedMediaAsset(userId, mediaId);
        storageService.deleteObject(asset.getStorageKey());
        mediaAssetRepository.delete(asset);
    }

    private MediaAssetResponse toResponse(MediaAsset a) {
        return new MediaAssetResponse(
                a.getMediaId(),
                a.getFlashcard().getFlashcardId(),
                a.getType(),
                a.getStorageKey(),
                a.getMimeType(),
                a.getOriginalFileName(),
                a.getSizeBytes(),
                a.getCreatedAt()
        );
    }

    private Flashcard getOwnedFlashcard(Long userId, Long flashcardId) {
        Flashcard flashcard = flashcardRepository.findById(flashcardId)
                .orElseThrow(() -> new EntityNotFoundException("Flashcard not found: " + flashcardId));
        if (!flashcard.getUser().getUserId().equals(userId)) {
            throw new EntityNotFoundException("Flashcard not found: " + flashcardId);
        }
        return flashcard;
    }

    private MediaAsset getOwnedMediaAsset(Long userId, Long mediaId) {
        MediaAsset asset = mediaAssetRepository.findById(mediaId)
                .orElseThrow(() -> new EntityNotFoundException("Media asset not found: " + mediaId));
        if (!asset.getFlashcard().getUser().getUserId().equals(userId)) {
            throw new EntityNotFoundException("Media asset not found: " + mediaId);
        }
        return asset;
    }

    private String buildObjectKey(Long userId, Long flashcardId, MediaType type, String fileName) {
        String safeName = fileName == null ? "file" : fileName;
        safeName = safeName.replaceAll("[^A-Za-z0-9._-]", "_");
        String uuid = UUID.randomUUID().toString();
        return "media/" + userId + "/" + flashcardId + "/" + type.name().toLowerCase()
                + "/" + uuid + "_" + safeName;
    }

    private void validateObjectKey(Long userId, Long flashcardId, String objectKey) {
        String prefix = "media/" + userId + "/" + flashcardId + "/";
        if (objectKey == null || !objectKey.startsWith(prefix)) {
            throw new IllegalArgumentException("Invalid objectKey");
        }
    }
}
