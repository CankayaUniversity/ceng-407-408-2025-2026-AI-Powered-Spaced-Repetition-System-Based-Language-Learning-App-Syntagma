package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.WordKnowledgeBatchEntry;
import com.syntagma.backend.dto.response.WordKnowledgeResponse;
import com.syntagma.backend.entity.WordKnowledge;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.repository.WordKnowledgeRepository;
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
public class WordKnowledgeService {

    private final WordKnowledgeRepository wordKnowledgeRepository;

    public Page<WordKnowledgeResponse> getAll(Long userId, KnowledgeStatus status, Pageable pageable) {
        if (status != null) {
            return wordKnowledgeRepository.findByUserIdAndStatus(userId, status, pageable).map(this::toResponse);
        }
        return wordKnowledgeRepository.findByUserId(userId, pageable).map(this::toResponse);
    }

    public WordKnowledgeResponse getByLemma(Long userId, String lemma) {
        WordKnowledge wk = wordKnowledgeRepository.findByUserIdAndLemma(userId, lemma)
                .orElseThrow(() -> new EntityNotFoundException("Word knowledge not found: " + lemma));
        return toResponse(wk);
    }

    @Transactional
    public WordKnowledgeResponse update(Long userId, String lemma, KnowledgeStatus status) {
        WordKnowledge wk = wordKnowledgeRepository.findByUserIdAndLemma(userId, lemma)
                .orElseGet(() -> {
                    WordKnowledge newWk = new WordKnowledge();
                    newWk.setUserId(userId);
                    newWk.setLemma(lemma);
                    return newWk;
                });

        wk.setStatus(status);
        wk.setUpdatedAt(LocalDateTime.now());
        WordKnowledge saved = wordKnowledgeRepository.save(wk);
        return toResponse(saved);
    }

    @Transactional
    public int batchUpdate(Long userId, List<WordKnowledgeBatchEntry> entries) {
        int count = 0;
        for (WordKnowledgeBatchEntry entry : entries) {
            update(userId, entry.lemma(), entry.status());
            count++;
        }
        return count;
    }

    private WordKnowledgeResponse toResponse(WordKnowledge wk) {
        return new WordKnowledgeResponse(
                wk.getUserId(),
                wk.getLemma(),
                wk.getStatus(),
                wk.getUpdatedAt()
        );
    }
}
