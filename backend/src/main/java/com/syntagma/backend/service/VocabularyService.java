package com.syntagma.backend.service;

import com.syntagma.backend.dto.response.VocabularyItemResponse;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.WordKnowledge;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.repository.FlashcardRepository;
import com.syntagma.backend.repository.WordKnowledgeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class VocabularyService {

    private final FlashcardRepository flashcardRepository;
    private final WordKnowledgeRepository wordKnowledgeRepository;

    public Page<VocabularyItemResponse> getVocabulary(Long userId, String status, String search, Pageable pageable) {
        KnowledgeStatus statusFilter = parseStatusFilter(status);
        String searchTerm = normalizeSearch(search);

        Map<String, VocabularyItemResponse> merged = new LinkedHashMap<>();

        List<WordKnowledge> knowledgeRows =
                wordKnowledgeRepository.findByUserIdAndStatusNot(userId, KnowledgeStatus.UNKNOWN);
        for (WordKnowledge item : knowledgeRows) {
            String lemma = cleanLemma(item.getLemma());
            String lemmaKey = normalizeLemma(lemma);
            if (lemmaKey.isBlank() || !matchesSearch(lemmaKey, searchTerm)) {
                continue;
            }

            KnowledgeStatus itemStatus = item.getStatus() != null ? item.getStatus() : KnowledgeStatus.LEARNING;
            merged.put(lemmaKey, new VocabularyItemResponse(
                    lemma,
                    lemmaKey,
                    itemStatus,
                    item.getUpdatedAt()
            ));
        }

        List<Flashcard> flashcards = flashcardRepository.findByUser_UserId(userId);
        for (Flashcard card : flashcards) {
            String lemma = cleanLemma(card.getLemma());
            String lemmaKey = normalizeLemma(lemma);
            if (lemmaKey.isBlank() || !matchesSearch(lemmaKey, searchTerm) || merged.containsKey(lemmaKey)) {
                continue;
            }

            KnowledgeStatus itemStatus = card.getKnowledgeStatus() != null
                    ? card.getKnowledgeStatus()
                    : KnowledgeStatus.LEARNING;
            if (itemStatus == KnowledgeStatus.UNKNOWN) {
                itemStatus = KnowledgeStatus.LEARNING;
            }

            LocalDateTime updatedAt = card.getUpdatedAt() != null ? card.getUpdatedAt() : card.getCreatedAt();
            merged.put(lemmaKey, new VocabularyItemResponse(
                    lemma,
                    lemmaKey,
                    itemStatus,
                    updatedAt
            ));
        }

        List<VocabularyItemResponse> filtered = new ArrayList<>(merged.values());
        if (statusFilter != null) {
            filtered = filtered.stream()
                    .filter(item -> item.status() == statusFilter)
                    .toList();
        }

        filtered = filtered.stream()
                .sorted(Comparator.comparing(VocabularyItemResponse::lemmaKey))
                .toList();

        int start = Math.min((int) pageable.getOffset(), filtered.size());
        int end = Math.min(start + pageable.getPageSize(), filtered.size());
        return new PageImpl<>(filtered.subList(start, end), pageable, filtered.size());
    }

    private KnowledgeStatus parseStatusFilter(String status) {
        if (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)) {
            return null;
        }
        return KnowledgeStatus.valueOf(status.trim().toUpperCase(Locale.ROOT));
    }

    private String cleanLemma(String value) {
        return value == null ? "" : value.trim();
    }

    private String normalizeLemma(String value) {
        return cleanLemma(value).toLowerCase(Locale.ROOT);
    }

    private String normalizeSearch(String value) {
        String normalized = normalizeLemma(value);
        return normalized.isBlank() ? null : normalized;
    }

    private boolean matchesSearch(String lemmaKey, String searchTerm) {
        return searchTerm == null || lemmaKey.contains(searchTerm);
    }
}
