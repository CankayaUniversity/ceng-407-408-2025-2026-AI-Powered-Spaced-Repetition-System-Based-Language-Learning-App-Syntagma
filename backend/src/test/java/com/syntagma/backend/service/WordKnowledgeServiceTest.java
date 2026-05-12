package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.WordKnowledgeBatchEntry;
import com.syntagma.backend.dto.response.WordKnowledgeResponse;
import com.syntagma.backend.entity.WordKnowledge;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.repository.WordKnowledgeRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WordKnowledgeServiceTest {

    @Mock private WordKnowledgeRepository wordKnowledgeRepository;
    @InjectMocks private WordKnowledgeService wordKnowledgeService;

    @Test
    void getByLemma_Success() {
        WordKnowledge wk = new WordKnowledge();
        wk.setUserId(1L);
        wk.setLemma("merhaba");
        wk.setStatus(KnowledgeStatus.LEARNING);
        wk.setUpdatedAt(LocalDateTime.now());

        when(wordKnowledgeRepository.findByUserIdAndLemma(1L, "merhaba"))
                .thenReturn(Optional.of(wk));

        WordKnowledgeResponse response = wordKnowledgeService.getByLemma(1L, "merhaba");

        assertEquals("merhaba", response.lemma());
        assertEquals(KnowledgeStatus.LEARNING, response.status());
    }

    @Test
    void getByLemma_NotFound_ThrowsException() {
        when(wordKnowledgeRepository.findByUserIdAndLemma(1L, "unknown"))
                .thenReturn(Optional.empty());

        assertThrows(EntityNotFoundException.class,
                () -> wordKnowledgeService.getByLemma(1L, "unknown"));
    }

    @Test
    void update_ExistingWord_Success() {
        WordKnowledge wk = new WordKnowledge();
        wk.setUserId(1L);
        wk.setLemma("hello");
        wk.setStatus(KnowledgeStatus.UNKNOWN);

        when(wordKnowledgeRepository.findByUserIdAndLemma(1L, "hello"))
                .thenReturn(Optional.of(wk));
        when(wordKnowledgeRepository.save(any(WordKnowledge.class))).thenReturn(wk);

        WordKnowledgeResponse response = wordKnowledgeService.update(1L, "hello", KnowledgeStatus.KNOWN);

        assertEquals(KnowledgeStatus.KNOWN, response.status());
        verify(wordKnowledgeRepository).save(wk);
    }

    @Test
    void update_NewWord_CreatesEntry() {
        when(wordKnowledgeRepository.findByUserIdAndLemma(1L, "newword"))
                .thenReturn(Optional.empty());
        when(wordKnowledgeRepository.save(any(WordKnowledge.class))).thenAnswer(inv -> inv.getArgument(0));

        WordKnowledgeResponse response = wordKnowledgeService.update(1L, "newword", KnowledgeStatus.UNKNOWN);

        assertEquals("newword", response.lemma());
        assertEquals(KnowledgeStatus.UNKNOWN, response.status());
        verify(wordKnowledgeRepository).save(any(WordKnowledge.class));
    }

    @Test
    void batchUpdate_ProcessesAllEntries() {
        when(wordKnowledgeRepository.findByUserIdAndLemma(anyLong(), anyString()))
                .thenReturn(Optional.empty());
        when(wordKnowledgeRepository.save(any(WordKnowledge.class))).thenAnswer(inv -> inv.getArgument(0));

        List<WordKnowledgeBatchEntry> entries = List.of(
                new WordKnowledgeBatchEntry("word1", KnowledgeStatus.UNKNOWN),
                new WordKnowledgeBatchEntry("word2", KnowledgeStatus.LEARNING),
                new WordKnowledgeBatchEntry("word3", KnowledgeStatus.KNOWN)
        );

        int updated = wordKnowledgeService.batchUpdate(1L, entries);

        assertEquals(3, updated);
        verify(wordKnowledgeRepository, times(3)).save(any(WordKnowledge.class));
    }

    @Test
    void markKnownByLevel_SetsKnownAndUnknownStatuses() {
        when(wordKnowledgeRepository.findByUserIdAndLemma(anyLong(), anyString()))
                .thenReturn(Optional.empty());
        when(wordKnowledgeRepository.save(any(WordKnowledge.class))).thenAnswer(inv -> inv.getArgument(0));

        int updated = wordKnowledgeService.markKnownByLevel(1L, "a1");

        ArgumentCaptor<WordKnowledge> captor = ArgumentCaptor.forClass(WordKnowledge.class);
        verify(wordKnowledgeRepository, times(updated)).save(captor.capture());
        List<WordKnowledge> savedWords = captor.getAllValues();

        assertTrue(savedWords.stream().anyMatch(wk -> wk.getStatus() == KnowledgeStatus.KNOWN));
        assertTrue(savedWords.stream().anyMatch(wk -> wk.getStatus() == KnowledgeStatus.UNKNOWN));
    }

    @Test
    void markKnownByLevel_InvalidLevel_ThrowsException() {
        assertThrows(IllegalArgumentException.class,
                () -> wordKnowledgeService.markKnownByLevel(1L, "invalid"));
        verify(wordKnowledgeRepository, never()).save(any(WordKnowledge.class));
    }
}
