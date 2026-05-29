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
import com.syntagma.backend.repository.SrsStateRepository;
import com.syntagma.backend.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CollectionServiceTest {

    @Mock private CollectionRepository collectionRepository;
    @Mock private CollectionItemRepository collectionItemRepository;
    @Mock private FlashcardRepository flashcardRepository;
    @Mock private SrsStateRepository srsStateRepository;
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

    private void stubEmptyCounts(User user, Long collectionId) {
        when(userRepository.findById(user.getUserId())).thenReturn(Optional.of(user));
        when(srsStateRepository.findDueCards(eq(user.getUserId()), any(LocalDateTime.class), any()))
                .thenReturn(List.of());
        when(flashcardRepository.findNewCards(eq(user.getUserId()), any()))
                .thenReturn(List.of());
        when(collectionItemRepository.findFlashcardIdsByCollectionId(collectionId)).thenReturn(List.of());
        when(flashcardRepository.findIdsByUserIdAndCollectionId(user.getUserId(), collectionId)).thenReturn(List.of());
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
        stubEmptyCounts(user, 5L);

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

    @Test
    void getById_ReturnsTotalAndReviewableCounts() {
        User user = mockUser();
        Collection collection = mockCollection(user);

        Flashcard dueFlashcard = new Flashcard();
        dueFlashcard.setFlashcardId(10L);
        dueFlashcard.setUser(user);

        com.syntagma.backend.entity.SrsState dueState = new com.syntagma.backend.entity.SrsState();
        dueState.setFlashcard(dueFlashcard);

        when(collectionRepository.findById(5L)).thenReturn(Optional.of(collection));
        when(collectionItemRepository.findByCollectionId(5L)).thenReturn(List.of());
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(srsStateRepository.findDueCards(eq(1L), any(LocalDateTime.class), any()))
                .thenReturn(List.of(dueState));
        when(flashcardRepository.findNewCards(eq(1L), any())).thenReturn(List.of());
        when(collectionItemRepository.findFlashcardIdsByCollectionId(5L)).thenReturn(List.of(10L, 11L));
        when(flashcardRepository.findIdsByUserIdAndCollectionId(1L, 5L)).thenReturn(List.of(11L, 12L));

        CollectionResponse response = collectionService.getById(1L, 5L);

        assertEquals(3, response.itemsCount());
        assertEquals(1, response.reviewableCount());
    }

    @Test
    void getById_AppliesNewLimitAfterCollectionFilter() {
        User user = mockUser();
        user.setDailyNewCardLimit(1);
        Collection collection = mockCollection(user);

        Flashcard otherCollectionNewCard = new Flashcard();
        otherCollectionNewCard.setFlashcardId(10L);
        otherCollectionNewCard.setUser(user);

        Flashcard collectionNewCard = new Flashcard();
        collectionNewCard.setFlashcardId(30L);
        collectionNewCard.setUser(user);

        when(collectionRepository.findById(5L)).thenReturn(Optional.of(collection));
        when(collectionItemRepository.findByCollectionId(5L)).thenReturn(List.of());
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(srsStateRepository.findDueCards(eq(1L), any(LocalDateTime.class), any()))
                .thenReturn(List.of());
        when(flashcardRepository.findNewCards(eq(1L), any()))
                .thenReturn(List.of(otherCollectionNewCard, collectionNewCard));
        when(collectionItemRepository.findFlashcardIdsByCollectionId(5L)).thenReturn(List.of());
        when(flashcardRepository.findIdsByUserIdAndCollectionId(1L, 5L)).thenReturn(List.of(30L));

        CollectionResponse response = collectionService.getById(1L, 5L);

        assertEquals(1, response.itemsCount());
        assertEquals(1, response.reviewableCount());
    }
}
