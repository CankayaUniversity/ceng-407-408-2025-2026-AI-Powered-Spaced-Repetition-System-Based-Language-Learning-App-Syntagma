package com.syntagma.backend.entity.enums;

/**
 * FSRS rating representing the user's recall quality.
 * Maps to the standard FSRS rating scale used by Anki.
 */
public enum Rating {
    AGAIN(1),   // Complete failure to recall
    HARD(2),    // Recalled with significant difficulty
    GOOD(3),    // Recalled with some effort
    EASY(4);    // Recalled effortlessly

    private final int value;

    Rating(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }

    public static Rating fromValue(int value) {
        return switch (value) {
            case 1 -> AGAIN;
            case 2 -> HARD;
            case 3 -> GOOD;
            case 4 -> EASY;
            default -> throw new IllegalArgumentException(
                    "Invalid FSRS rating: " + value + ". Must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).");
        };
    }
}
