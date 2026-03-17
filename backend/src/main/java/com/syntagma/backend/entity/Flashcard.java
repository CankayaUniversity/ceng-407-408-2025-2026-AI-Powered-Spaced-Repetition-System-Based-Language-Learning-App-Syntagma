package com.syntagma.backend.entity;

import com.syntagma.backend.entity.enums.KnowledgeStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
public class Flashcard {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long flashcardId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    private String lemma;

    private String translation;

    @Column(columnDefinition = "TEXT")
    private String sourceSentence;

    @Column(columnDefinition = "TEXT")
    private String exampleSentence;

    @Enumerated(EnumType.STRING)
    private KnowledgeStatus knowledgeStatus;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
