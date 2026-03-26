package com.syntagma.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
public class SrsState {
    @Id
    private Long flashcardId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "flashcard_id")
    private Flashcard flashcard;

    // FSRS core memory parameters
    private Float stability;

    private Float difficulty;

    private Float retrievability;

    // FSRS scheduling fields
    private Integer reps;

    private Integer lapses;

    /** FSRS card state: NEW, LEARNING, REVIEW, RELEARNING */
    private String state;

    private Integer scheduledDays;

    private Integer elapsedDays;

    private LocalDateTime lastReviewedAt;

    private LocalDateTime nextReviewAt;

    /**
     * Initializes a brand-new FSRS card with default values.
     */
    public static SrsState createNew(Flashcard flashcard) {
        SrsState s = new SrsState();
        s.setFlashcard(flashcard);
        s.setStability(0f);
        s.setDifficulty(0f);
        s.setRetrievability(0f);
        s.setReps(0);
        s.setLapses(0);
        s.setState("NEW");
        s.setScheduledDays(0);
        s.setElapsedDays(0);
        s.setLastReviewedAt(null);
        s.setNextReviewAt(flashcard.getCreatedAt() != null ? flashcard.getCreatedAt() : LocalDateTime.now());
        return s;
    }
}
