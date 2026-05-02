package com.syntagma.backend.entity;

import com.syntagma.backend.entity.enums.MediaType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
public class MediaAsset {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long mediaId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "flashcard_id", nullable = false)
    private Flashcard flashcard;

    @Enumerated(EnumType.STRING)
    private MediaType type;

    private String storageKey;

    private String mimeType;

    private String originalFileName;

    private Long sizeBytes;

    private LocalDateTime createdAt;
}
