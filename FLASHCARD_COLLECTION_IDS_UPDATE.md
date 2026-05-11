# Flashcard collectionIds update

Date: 2026-05-10

## Backend changes done

1) Added collection IDs to flashcard responses
- FlashcardResponse now includes collectionIds: List<Long>
- File: backend/src/main/java/com/syntagma/backend/dto/response/FlashcardResponse.java

2) Added bulk lookup for collection IDs
- CollectionItemRepository has findByFlashcardIdIn(List<Long> flashcardIds)
- File: backend/src/main/java/com/syntagma/backend/repository/CollectionItemRepository.java

3) Optimized flashcard listing mapping
- FlashcardService.getAll now batch-loads collection IDs and maps them once
- Individual toResponse(f) still used for getById/update/create
- File: backend/src/main/java/com/syntagma/backend/service/FlashcardService.java

4) Updated tests for new dependency
- FlashcardServiceTest mocks CollectionItemRepository
- File: backend/src/test/java/com/syntagma/backend/service/FlashcardServiceTest.java

## Test verification

- Command: ./backend/gradlew -p backend test
- Result: BUILD SUCCESSFUL

## Extension work (not done, to be handled by another agent)

Where collectionIds should be integrated:

1) Map backend response -> FlashcardPayload
- File: extension/src/background/service-worker.ts
- Function: mapBackendFlashcard(fc)
- Current: deckName is hardcoded to "Syntagma"
- Needed: read fc.collectionIds and map to UI representation

2) Extend FlashcardPayload type
- File: extension/src/shared/types.ts
- Add: collectionIds?: string[] | number[] (use backend type: number[])

3) Render collection/deck info in UI
- File: extension/src/options/OptionsApp.tsx
- FlashcardsTab currently shows card.deckName only
- Update to show collectionIds (or resolved collection names)

Notes:
- Backend now provides collectionIds in /api/flashcards responses.
- If frontend wants collection names, it must map IDs to names using /api/collections.
