package com.syntagma.backend.entity;

import com.syntagma.backend.entity.enums.SyncEventType;
import com.syntagma.backend.entity.enums.SyncStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity
@Getter
@Setter
public class SyncEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long syncId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    private SyncEventType eventType;

    private LocalDateTime clientTimestamp;

    private LocalDateTime serverReceivedAt;

    @Enumerated(EnumType.STRING)
    private SyncStatus status;
}
