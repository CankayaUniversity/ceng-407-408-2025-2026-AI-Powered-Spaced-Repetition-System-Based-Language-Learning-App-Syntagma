package com.syntagma.backend.repository;

import com.syntagma.backend.entity.SyncEvent;
import com.syntagma.backend.entity.enums.SyncStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDateTime;
import java.util.List;

public interface SyncEventRepository extends JpaRepository<SyncEvent, Long> {

    List<SyncEvent> findByUser_UserIdAndServerReceivedAtAfter(Long userId, LocalDateTime since);

    long countByUser_UserIdAndStatus(Long userId, SyncStatus status);
}
