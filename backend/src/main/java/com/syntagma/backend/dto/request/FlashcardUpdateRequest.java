package com.syntagma.backend.dto.request;

import com.syntagma.backend.entity.enums.KnowledgeStatus;

public record FlashcardUpdateRequest(
        String lemma,
        String translation,
        String sourceSentence,
        String exampleSentence,
        Long collectionId,
        Boolean clearCollection,
        KnowledgeStatus knowledgeStatus
) {}
