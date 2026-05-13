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
import static org.mockito.ArgumentMatchers.anyCollection;
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

        WordKnowledgeResponse response = wordKnowledgeService.update(1L, "newword", KnowledgeStatus.LEARNING);

        assertEquals("newword", response.lemma());
        assertEquals(KnowledgeStatus.LEARNING, response.status());
        verify(wordKnowledgeRepository).save(any(WordKnowledge.class));
    }

    @Test
    void update_UnknownStatus_DeletesEntry() {
        WordKnowledgeResponse response = wordKnowledgeService.update(1L, "hello", KnowledgeStatus.UNKNOWN);

        assertEquals("hello", response.lemma());
        assertEquals(KnowledgeStatus.UNKNOWN, response.status());
        verify(wordKnowledgeRepository).deleteByUserIdAndLemma(1L, "hello");
        verify(wordKnowledgeRepository, never()).save(any(WordKnowledge.class));
    }

    @Test
    void delete_RemovesEntryForUserAndLemma() {
        wordKnowledgeService.delete(2L, "browser");

        verify(wordKnowledgeRepository).deleteByUserIdAndLemma(2L, "browser");
        verify(wordKnowledgeRepository, never()).save(any(WordKnowledge.class));
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
        verify(wordKnowledgeRepository, times(2)).save(any(WordKnowledge.class));
        verify(wordKnowledgeRepository).deleteByUserIdAndLemma(1L, "word1");
    }

    @Test
    void markKnownByLevel_SetsKnownAndDeletesAboveLevelWords() {
        when(wordKnowledgeRepository.findByUserIdAndLemma(anyLong(), anyString()))
                .thenReturn(Optional.empty());
        when(wordKnowledgeRepository.save(any(WordKnowledge.class))).thenAnswer(inv -> inv.getArgument(0));
        when(wordKnowledgeRepository.deleteByUserIdAndLemmaIn(eq(1L), anyCollection()))
                .thenReturn(10L);

        int updated = wordKnowledgeService.markKnownByLevel(1L, "a1");

        ArgumentCaptor<WordKnowledge> captor = ArgumentCaptor.forClass(WordKnowledge.class);
        verify(wordKnowledgeRepository, atLeastOnce()).save(captor.capture());
        verify(wordKnowledgeRepository).deleteByUserIdAndLemmaIn(eq(1L), anyCollection());
        List<WordKnowledge> savedWords = captor.getAllValues();

        assertTrue(updated > 0);
        assertTrue(savedWords.stream().allMatch(wk -> wk.getStatus() == KnowledgeStatus.KNOWN));
    }

    @Test
    void markKnownByLevel_InvalidLevel_ThrowsException() {
        assertThrows(IllegalArgumentException.class,
                () -> wordKnowledgeService.markKnownByLevel(1L, "invalid"));
        verify(wordKnowledgeRepository, never()).save(any(WordKnowledge.class));
        verify(wordKnowledgeRepository, never()).deleteByUserIdAndLemmaIn(anyLong(), anyCollection());
    }
}
