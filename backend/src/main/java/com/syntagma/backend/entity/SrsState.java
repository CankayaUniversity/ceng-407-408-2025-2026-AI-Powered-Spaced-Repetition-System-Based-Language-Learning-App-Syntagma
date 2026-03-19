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

    private Float stability;

    private Float difficulty;

    private Float retrievable;

    private LocalDateTime lastReviewedAt;

    private LocalDateTime nextReviewAt;
}
