package com.syntagma.backend.dto.response;

import java.util.List;

public record AiSentenceExplainResponse(
        List<SentencePart> parts,
        String turkishMeaning,
        String grammarStructure,
        String whyThisStructure,
        String learnerTip
) {
    public record SentencePart(String chunk, String function) {}
}
