import { describe, expect, it } from 'vitest';
import {
  buildBackendFlashcardPayload,
  cardMatchesCollection,
  mapBackendFlashcard,
  resolveCardCollectionLabel,
} from './flashcards';
import type { FlashcardPayload } from './types';

describe('shared/flashcards mapping', () => {
  it('maps backend response fields into FlashcardPayload', () => {
    const mapped = mapBackendFlashcard({
      flashcardId: 99,
      lemma: 'hello',
      translation: 'merhaba',
      sourceSentence: 'hello world',
      exampleSentence: 'example sentence',
      collectionId: 3,
      collectionIds: [3, 4],
      knowledgeStatus: 'LEARNING',
      createdAt: '2026-05-10T12:00:00Z',
      updatedAt: '2026-05-10T12:05:00Z',
    });

    expect(mapped.id).toBe('99');
    expect(mapped.trMeaning).toBe('merhaba');
    expect(mapped.sentence).toBe('hello world');
    expect(mapped.exampleSentence).toBe('example sentence');
    expect(mapped.collectionId).toBe(3);
    expect(mapped.collectionIds).toEqual([3, 4]);
    expect(mapped.knowledgeStatus).toBe('LEARNING');
    expect(mapped.createdAt).toBeTypeOf('number');
    expect(mapped.updatedAt).toBeTypeOf('number');
  });

  it('builds update payload for selected deck and unsorted deck', () => {
    const card: FlashcardPayload = {
      id: '1',
      lemma: 'hello',
      surfaceForm: 'Hello',
      sentence: 'Hello world',
      exampleSentence: 'Example',
      sourceUrl: 'https://example.com',
      sourceTitle: 'Example',
      trMeaning: 'Merhaba',
      knowledgeStatus: 'KNOWN',
      createdAt: Date.now(),
      deckName: 'Syntagma',
      tags: ['syntagma'],
    };

    const withDeck = buildBackendFlashcardPayload(card, 7);
    expect(withDeck.collectionId).toBe(7);
    expect(withDeck.clearCollection).toBeUndefined();

    const unsorted = buildBackendFlashcardPayload(card, null);
    expect(unsorted.collectionId).toBeUndefined();
    expect(unsorted.clearCollection).toBe(true);
  });
});

describe('shared/flashcards collection helpers', () => {
  const card: FlashcardPayload = {
    id: 'a',
    lemma: 'hello',
    surfaceForm: 'Hello',
    sentence: 'Hello world',
    sourceUrl: '',
    sourceTitle: '',
    trMeaning: 'Merhaba',
    createdAt: Date.now(),
    deckName: 'Syntagma',
    tags: ['syntagma'],
    collectionId: 2,
    collectionIds: [2, 5],
  };

  it('matches both direct and membership collection IDs', () => {
    expect(cardMatchesCollection(card, 2)).toBe(true);
    expect(cardMatchesCollection(card, 5)).toBe(true);
    expect(cardMatchesCollection(card, 9)).toBe(false);
  });

  it('resolves collection names with fallback labels', () => {
    const label = resolveCardCollectionLabel(card, { 2: 'Core Deck' });
    expect(label).toContain('Core Deck');
    expect(label).toContain('Collection #5');
  });
});

