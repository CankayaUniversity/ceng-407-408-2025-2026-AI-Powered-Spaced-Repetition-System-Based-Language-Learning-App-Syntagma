package com.syntagma.backend.entity.enums;

/**
 * FSRS card state representing the learning phase of a card.
 * Matches the standard FSRS/Anki state model.
 */
public enum CardState {
    NEW,          // Card has never been reviewed
    LEARNING,     // Card is being learned for the first time
    REVIEW,       // Card has graduated to long-term review
    RELEARNING;   // Card was forgotten and is being relearned

    public static CardState fromString(String s) {
        if (s == null) return NEW;
        return switch (s.toUpperCase()) {
            case "NEW" -> NEW;
            case "LEARNING" -> LEARNING;
            case "REVIEW" -> REVIEW;
            case "RELEARNING" -> RELEARNING;
            default -> NEW;
        };
    }
}
