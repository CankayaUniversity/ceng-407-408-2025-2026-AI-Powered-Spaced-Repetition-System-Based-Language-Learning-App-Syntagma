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
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WordKnowledgeService {

    private final WordKnowledgeRepository wordKnowledgeRepository;

    private static final Set<String> SUPPORTED_LEVELS = Set.of("a1", "a2", "b1", "b2");

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

    @Transactional
    public int markKnownByLevel(Long userId, String level) {
        List<String> words = loadLevelWords(level);
        List<WordKnowledgeBatchEntry> entries = words.stream()
                .map(word -> new WordKnowledgeBatchEntry(word, KnowledgeStatus.KNOWN))
                .toList();
        return batchUpdate(userId, entries);
    }

    private WordKnowledgeResponse toResponse(WordKnowledge wk) {
        return new WordKnowledgeResponse(
                wk.getUserId(),
                wk.getLemma(),
                wk.getStatus(),
                wk.getUpdatedAt()
        );
    }

    private List<String> loadLevelWords(String level) {
        String normalized = level == null ? "" : level.trim().toLowerCase(Locale.ROOT);
        if (!SUPPORTED_LEVELS.contains(normalized)) {
            throw new IllegalArgumentException("Unsupported level: " + level);
        }

        String resourcePath = "levels/" + normalized + ".txt";
        List<String> words = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                WordKnowledgeService.class.getClassLoader().getResourceAsStream(resourcePath)))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }
                words.add(trimmed);
            }
        } catch (IOException | NullPointerException ex) {
            throw new IllegalStateException("Level word list not found: " + resourcePath, ex);
        }

        return words;
    }
}
