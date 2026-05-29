package com.syntagma.backend.service;

import com.syntagma.backend.dto.response.VocabularyItemResponse;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.WordKnowledge;
import com.syntagma.backend.entity.enums.KnowledgeStatus;
import com.syntagma.backend.repository.FlashcardRepository;
import com.syntagma.backend.repository.WordKnowledgeRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VocabularyServiceTest {

    @Mock private FlashcardRepository flashcardRepository;
    @Mock private WordKnowledgeRepository wordKnowledgeRepository;
    @InjectMocks private VocabularyService vocabularyService;

    @Test
    void getVocabulary_MergesFlashcardsAndWordKnowledgeWithKnowledgePrecedence() {
        Flashcard hello = flashcard("Hello", KnowledgeStatus.LEARNING);
        Flashcard browser = flashcard("Browser", KnowledgeStatus.UNKNOWN);
        WordKnowledge helloKnowledge = wordKnowledge("hello", KnowledgeStatus.KNOWN);

        when(wordKnowledgeRepository.findByUserIdAndStatusNot(1L, KnowledgeStatus.UNKNOWN))
                .thenReturn(List.of(helloKnowledge));
        when(flashcardRepository.findByUser_UserId(1L)).thenReturn(List.of(hello, browser));

        Page<VocabularyItemResponse> page = vocabularyService.getVocabulary(
                1L,
                "ALL",
                null,
                PageRequest.of(0, 50)
        );

        assertEquals(2, page.getTotalElements());
        assertEquals(KnowledgeStatus.LEARNING, page.getContent().get(0).status());
        assertEquals("browser", page.getContent().get(0).lemmaKey());
        assertEquals(KnowledgeStatus.KNOWN, page.getContent().get(1).status());
        assertEquals("hello", page.getContent().get(1).lemmaKey());
    }

    @Test
    void getVocabulary_AppliesSearchStatusAndPagination() {
        when(wordKnowledgeRepository.findByUserIdAndStatusNot(1L, KnowledgeStatus.UNKNOWN))
                .thenReturn(List.of(
                        wordKnowledge("alpha", KnowledgeStatus.KNOWN),
                        wordKnowledge("alphabet", KnowledgeStatus.LEARNING),
                        wordKnowledge("beta", KnowledgeStatus.KNOWN)
                ));
        when(flashcardRepository.findByUser_UserId(1L)).thenReturn(List.of());

        Page<VocabularyItemResponse> page = vocabularyService.getVocabulary(
                1L,
                "KNOWN",
                "alp",
                PageRequest.of(0, 1)
        );

        assertEquals(1, page.getTotalElements());
        assertEquals(1, page.getContent().size());
        assertEquals("alpha", page.getContent().get(0).lemmaKey());
        assertEquals(KnowledgeStatus.KNOWN, page.getContent().get(0).status());
    }

    private Flashcard flashcard(String lemma, KnowledgeStatus status) {
        Flashcard flashcard = new Flashcard();
        flashcard.setLemma(lemma);
        flashcard.setKnowledgeStatus(status);
        flashcard.setCreatedAt(LocalDateTime.now().minusDays(1));
        flashcard.setUpdatedAt(LocalDateTime.now());
        return flashcard;
    }

    private WordKnowledge wordKnowledge(String lemma, KnowledgeStatus status) {
        WordKnowledge wordKnowledge = new WordKnowledge();
        wordKnowledge.setUserId(1L);
        wordKnowledge.setLemma(lemma);
        wordKnowledge.setStatus(status);
        wordKnowledge.setUpdatedAt(LocalDateTime.now());
        return wordKnowledge;
    }
}
