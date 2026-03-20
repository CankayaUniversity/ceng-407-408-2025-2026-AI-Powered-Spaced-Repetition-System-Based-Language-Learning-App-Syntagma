package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.SyncEventRequest;
import com.syntagma.backend.dto.response.SyncPullResponse;
import com.syntagma.backend.dto.response.SyncPushResponse;
import com.syntagma.backend.dto.response.SyncStatusResponse;
import com.syntagma.backend.entity.SyncEvent;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.entity.enums.SyncEventType;
import com.syntagma.backend.entity.enums.SyncStatus;
import com.syntagma.backend.repository.SyncEventRepository;
import com.syntagma.backend.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SyncServiceTest {

    @Mock private SyncEventRepository syncEventRepository;
    @Mock private UserRepository userRepository;
    @InjectMocks private SyncService syncService;

    @Test
    void pushEvents_Success() {
        User user = new User();
        user.setUserId(1L);

        SyncEvent savedEvent = new SyncEvent();
        savedEvent.setSyncId(100L);
        savedEvent.setEventType(SyncEventType.CREATE);
        savedEvent.setStatus(SyncStatus.PROCESSED);

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(syncEventRepository.save(any(SyncEvent.class))).thenReturn(savedEvent);

        List<SyncEventRequest> events = List.of(
                new SyncEventRequest(SyncEventType.CREATE, "flashcard", 10L,
                        LocalDateTime.now(), null)
        );

        SyncPushResponse response = syncService.pushEvents(1L, events);

        assertEquals(1, response.processed());
        assertEquals(0, response.failed());
        assertEquals(1, response.results().size());
        assertEquals(SyncStatus.PROCESSED, response.results().get(0).status());
    }

    @Test
    void pushEvents_UserNotFound_ThrowsException() {
        when(userRepository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(EntityNotFoundException.class,
                () -> syncService.pushEvents(99L, List.of()));
    }

    @Test
    void pullEvents_ReturnsChanges() {
        SyncEvent event = new SyncEvent();
        event.setSyncId(50L);
        event.setEventType(SyncEventType.UPDATE);
        event.setServerReceivedAt(LocalDateTime.now());

        when(syncEventRepository.findByUser_UserIdAndServerReceivedAtAfter(eq(1L), any(LocalDateTime.class)))
                .thenReturn(List.of(event));

        SyncPullResponse response = syncService.pullEvents(1L, LocalDateTime.now().minusDays(1));

        assertEquals(1, response.changes().size());
        assertEquals(SyncEventType.UPDATE, response.changes().get(0).eventType());
    }

    @Test
    void getStatus_ReturnsCorrectCounts() {
        when(syncEventRepository.countByUser_UserIdAndStatus(1L, SyncStatus.PENDING)).thenReturn(3L);
        when(syncEventRepository.countByUser_UserIdAndStatus(1L, SyncStatus.FAILED)).thenReturn(1L);
        when(syncEventRepository.findByUser_UserIdAndServerReceivedAtAfter(eq(1L), any(LocalDateTime.class)))
                .thenReturn(List.of());

        SyncStatusResponse response = syncService.getStatus(1L);

        assertEquals(3L, response.pendingEvents());
        assertEquals(1L, response.failedEvents());
    }
}
