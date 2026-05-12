package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.EbookCreateRequest;
import com.syntagma.backend.dto.request.EbookPresignRequest;
import com.syntagma.backend.dto.request.EbookProgressUpdateRequest;
import com.syntagma.backend.dto.response.EbookPresignResponse;
import com.syntagma.backend.dto.response.EbookResponse;
import com.syntagma.backend.dto.response.EbookUrlResponse;
import com.syntagma.backend.entity.Ebook;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.repository.EbookRepository;
import com.syntagma.backend.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class EbookService {

    private final EbookRepository ebookRepository;
    private final UserRepository userRepository;
    private final StorageService storageService;

    @Transactional
    public EbookPresignResponse createPresignedUpload(Long userId, EbookPresignRequest request) {
        validateEpubFile(request.fileName());
        String objectKey = buildObjectKey(userId, request.fileName());
        StoragePresignResult presign = storageService.createPresignedUpload(objectKey, request.contentType());
        return new EbookPresignResponse(presign.url(), objectKey, presign.expiresAt());
    }

    @Transactional
    public EbookResponse createEbook(Long userId, EbookCreateRequest request) {
        validateEpubFile(request.originalFileName());
        validateObjectKey(userId, request.objectKey());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));

        Ebook ebook = new Ebook();
        ebook.setUser(user);
        ebook.setTitle(resolveTitle(request.title(), request.originalFileName()));
        ebook.setStorageKey(request.objectKey());
        ebook.setMimeType(request.contentType());
        ebook.setOriginalFileName(request.originalFileName());
        ebook.setSizeBytes(request.size());
        ebook.setLastPage(0);
        ebook.setCreatedAt(LocalDateTime.now());
        ebook.setUpdatedAt(LocalDateTime.now());

        Ebook saved = ebookRepository.save(ebook);
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<EbookResponse> getAll(Long userId) {
        return ebookRepository.findByUser_UserIdOrderByCreatedAtDesc(userId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public EbookResponse getById(Long userId, Long ebookId) {
        Ebook ebook = getOwnedEbook(userId, ebookId);
        return toResponse(ebook);
    }

    @Transactional(readOnly = true)
    public EbookUrlResponse getDownloadUrl(Long userId, Long ebookId) {
        Ebook ebook = getOwnedEbook(userId, ebookId);
        StoragePresignResult presign = storageService.createPresignedDownload(ebook.getStorageKey());
        return new EbookUrlResponse(presign.url(), presign.expiresAt());
    }

    @Transactional
    public EbookResponse updateProgress(Long userId, Long ebookId, EbookProgressUpdateRequest request) {
        Ebook ebook = getOwnedEbook(userId, ebookId);
        ebook.setLastPage(request.lastPage());
        ebook.setUpdatedAt(LocalDateTime.now());
        Ebook saved = ebookRepository.save(ebook);
        return toResponse(saved);
    }

    @Transactional
    public void delete(Long userId, Long ebookId) {
        Ebook ebook = getOwnedEbook(userId, ebookId);
        storageService.deleteObject(ebook.getStorageKey());
        ebookRepository.delete(ebook);
    }

    private Ebook getOwnedEbook(Long userId, Long ebookId) {
        Ebook ebook = ebookRepository.findById(ebookId)
                .orElseThrow(() -> new EntityNotFoundException("Ebook not found: " + ebookId));
        if (!ebook.getUser().getUserId().equals(userId)) {
            throw new EntityNotFoundException("Ebook not found: " + ebookId);
        }
        return ebook;
    }

    private EbookResponse toResponse(Ebook ebook) {
        return new EbookResponse(
                ebook.getEbookId(),
                ebook.getUser().getUserId(),
                ebook.getTitle(),
                ebook.getStorageKey(),
                ebook.getMimeType(),
                ebook.getOriginalFileName(),
                ebook.getSizeBytes(),
                ebook.getLastPage(),
                ebook.getCreatedAt(),
                ebook.getUpdatedAt()
        );
    }

    private void validateEpubFile(String fileName) {
        if (fileName == null || !fileName.toLowerCase().endsWith(".epub")) {
            throw new IllegalArgumentException("Only .epub files are supported");
        }
    }

    private String resolveTitle(String title, String fileName) {
        if (title != null && !title.isBlank()) {
            return title;
        }
        return fileName;
    }

    private String buildObjectKey(Long userId, String fileName) {
        String safeName = fileName == null ? "file.epub" : fileName;
        safeName = safeName.replaceAll("[^A-Za-z0-9._-]", "_");
        String uuid = UUID.randomUUID().toString();
        return "ebooks/" + userId + "/" + uuid + "_" + safeName;
    }

    private void validateObjectKey(Long userId, String objectKey) {
        String prefix = "ebooks/" + userId + "/";
        if (objectKey == null || !objectKey.startsWith(prefix)) {
            throw new IllegalArgumentException("Invalid objectKey");
        }
    }
}
