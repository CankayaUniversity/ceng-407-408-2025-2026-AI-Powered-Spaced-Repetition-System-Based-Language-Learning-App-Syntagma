package com.syntagma.backend.service;

import com.syntagma.backend.dto.request.CollectionCreateRequest;
import com.syntagma.backend.dto.response.CollectionItemResponse;
import com.syntagma.backend.dto.response.CollectionResponse;
import com.syntagma.backend.entity.Collection;
import com.syntagma.backend.entity.Flashcard;
import com.syntagma.backend.entity.User;
import com.syntagma.backend.exception.DuplicateResourceException;
import com.syntagma.backend.repository.CollectionItemRepository;
import com.syntagma.backend.repository.CollectionRepository;
import com.syntagma.backend.repository.FlashcardRepository;
import com.syntagma.backend.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CollectionServiceTest {

    @Mock private CollectionRepository collectionRepository;
    @Mock private CollectionItemRepository collectionItemRepository;
    @Mock private FlashcardRepository flashcardRepository;
    @Mock private UserRepository userRepository;
    @InjectMocks private CollectionService collectionService;

    private User mockUser() {
        User user = new User();
        user.setUserId(1L);
        return user;
    }

    private Collection mockCollection(User user) {
        Collection c = new Collection();
        c.setCollectionId(5L);
        c.setUser(user);
        c.setName("Turkish Basics");
        c.setCreatedAt(LocalDateTime.now());
        return c;
    }

    @Test
    void create_Success() {
        User user = mockUser();
        CollectionCreateRequest request = new CollectionCreateRequest("Turkish Basics");

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(collectionRepository.save(any(Collection.class))).thenAnswer(inv -> {
            Collection c = inv.getArgument(0);
            c.setCollectionId(5L);
            return c;
        });

        CollectionResponse response = collectionService.create(1L, request);

        assertNotNull(response);
        assertEquals("Turkish Basics", response.name());
        verify(collectionRepository).save(any(Collection.class));
    }

    @Test
    void create_UserNotFound_ThrowsException() {
        when(userRepository.findById(99L)).thenReturn(Optional.empty());
        assertThrows(EntityNotFoundException.class,
                () -> collectionService.create(99L, new CollectionCreateRequest("Test")));
    }

    @Test
    void update_Success() {
        User user = mockUser();
        Collection collection = mockCollection(user);

        when(collectionRepository.findById(5L)).thenReturn(Optional.of(collection));
        when(collectionRepository.save(any(Collection.class))).thenReturn(collection);

        CollectionResponse response = collectionService.update(1L, 5L,
                new CollectionCreateRequest("Advanced Turkish"));

        assertEquals("Advanced Turkish", response.name());
    }

    @Test
    void update_WrongOwner_ThrowsException() {
        User user = mockUser();
        Collection collection = mockCollection(user);

        when(collectionRepository.findById(5L)).thenReturn(Optional.of(collection));

        assertThrows(EntityNotFoundException.class,
                () -> collectionService.update(999L, 5L, new CollectionCreateRequest("Hack")));
    }

    @Test
    void delete_Success() {
        User user = mockUser();
        Collection collection = mockCollection(user);

        when(collectionRepository.findById(5L)).thenReturn(Optional.of(collection));

        collectionService.delete(1L, 5L);

        verify(collectionRepository).delete(collection);
    }

    @Test
    void addItem_DuplicateFlashcard_ThrowsException() {
        User user = mockUser();
        Collection collection = mockCollection(user);

        when(collectionRepository.findById(5L)).thenReturn(Optional.of(collection));
        when(flashcardRepository.findById(10L)).thenReturn(Optional.of(new Flashcard()));
        when(collectionItemRepository.existsByCollectionIdAndFlashcardId(5L, 10L)).thenReturn(true);

        assertThrows(DuplicateResourceException.class,
                () -> collectionService.addItem(1L, 5L, 10L));
    }
}
