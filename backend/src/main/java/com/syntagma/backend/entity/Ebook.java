package com.syntagma.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
public class Ebook {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long ebookId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    private String title;

    private String storageKey;

    private String mimeType;

    private String originalFileName;

    private Long sizeBytes;

    private Integer lastPage;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
