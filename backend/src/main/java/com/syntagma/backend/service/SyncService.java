package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.SyncEventRequest;
import com.syntagma.backend.dto.response.*;
import com.syntagma.backend.entity.SyncEvent;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.entity.enums.SyncStatus;
import com.syntagma.backend.repository.SyncEventRepository;
import com.syntagma.backend.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SyncService {

    private final SyncEventRepository syncEventRepository;
    private final UserRepository userRepository;

    @Transactional
    public SyncPushResponse pushEvents(Long userId, List<SyncEventRequest> events) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));

        List<SyncPushResponse.SyncResultItem> results = new ArrayList<>();
        int processed = 0;
        int failed = 0;

        for (SyncEventRequest eventReq : events) {
            try {
                SyncEvent syncEvent = new SyncEvent();
                syncEvent.setUser(user);
                syncEvent.setEventType(eventReq.eventType());
                syncEvent.setClientTimestamp(eventReq.clientTimestamp());
                syncEvent.setServerReceivedAt(LocalDateTime.now());
                syncEvent.setStatus(SyncStatus.PROCESSED);

                // TODO: Actual entity processing based on entityType and data
                SyncEvent saved = syncEventRepository.save(syncEvent);

                results.add(new SyncPushResponse.SyncResultItem(
                        saved.getSyncId(),
                        saved.getEventType(),
                        saved.getStatus(),
                        eventReq.entityId()
                ));
                processed++;
            } catch (Exception e) {
                failed++;
                results.add(new SyncPushResponse.SyncResultItem(
                        null,
                        eventReq.eventType(),
                        SyncStatus.FAILED,
                        eventReq.entityId()
                ));
            }
        }

        return new SyncPushResponse(processed, failed, results);
    }

    public SyncPullResponse pullEvents(Long userId, LocalDateTime since) {
        List<SyncEvent> events = syncEventRepository.findByUser_UserIdAndServerReceivedAtAfter(userId, since);

        List<SyncPullResponse.SyncChange> changes = events.stream()
                .map(e -> new SyncPullResponse.SyncChange(
                        "sync_event",
                        e.getSyncId(),
                        e.getEventType(),
                        e.getServerReceivedAt(),
                        Map.of()
                ))
                .toList();

        return new SyncPullResponse(LocalDateTime.now(), changes);
    }

    public SyncStatusResponse getStatus(Long userId) {
        long pendingEvents = syncEventRepository.countByUser_UserIdAndStatus(userId, SyncStatus.PENDING);
        long failedEvents = syncEventRepository.countByUser_UserIdAndStatus(userId, SyncStatus.FAILED);

        // Find the latest sync event's timestamp
        List<SyncEvent> recentEvents = syncEventRepository.findByUser_UserIdAndServerReceivedAtAfter(
                userId, LocalDateTime.now().minusYears(10));
        LocalDateTime lastSync = recentEvents.isEmpty() ? null :
                recentEvents.stream()
                        .map(SyncEvent::getServerReceivedAt)
                        .max(LocalDateTime::compareTo)
                        .orElse(null);

        return new SyncStatusResponse(lastSync, pendingEvents, failedEvents);
    }
}
