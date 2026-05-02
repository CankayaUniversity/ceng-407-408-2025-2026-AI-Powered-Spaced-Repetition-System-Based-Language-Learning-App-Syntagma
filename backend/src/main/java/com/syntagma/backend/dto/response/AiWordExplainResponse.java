package com.syntagma.backend.dto.response;

import java.util.List;

public record AiWordExplainResponse(
        String meaning,
        String partOfSpeech,
        String usageNote,
        String commonMistake,
        List<String> examples
) {}
