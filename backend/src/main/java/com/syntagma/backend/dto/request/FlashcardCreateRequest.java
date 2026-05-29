package com.syntagma.backend.dto.request;

import com.syntagma.backend.entity.enums.KnowledgeStatus;

public record FlashcardCreateRequest(
        String lemma,
        String translation,
        String sourceSentence,
        String exampleSentence,
        String usageNote,
        Long collectionId,
        Boolean clearCollection,
        KnowledgeStatus knowledgeStatus
) {}
