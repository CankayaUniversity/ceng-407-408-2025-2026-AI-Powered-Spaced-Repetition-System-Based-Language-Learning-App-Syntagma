package com.syntagma.backend.entity;

import com.syntagma.backend.entity.enums.DeviceType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
public class ReviewLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long reviewId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "flashcard_id", nullable = false)
    private Flashcard flashcard;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    private LocalDateTime reviewedAt;

    private LocalDate reviewedOn;

    private Integer result;

    @Enumerated(EnumType.STRING)
    private DeviceType device;

    private LocalDateTime clientTimestamp;

    private String clientTimeZone;
}
