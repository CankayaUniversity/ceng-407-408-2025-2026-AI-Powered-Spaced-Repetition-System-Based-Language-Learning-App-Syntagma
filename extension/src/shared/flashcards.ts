import type { FlashcardPayload } from './types';

export type KnowledgeStatusValue = 'KNOWN' | 'LEARNING' | 'UNKNOWN' | 'IGNORED';

export interface BackendFlashcard {
  flashcardId?: number | string | null;
  lemma?: string | null;
  translation?: string | null;
  sourceSentence?: string | null;
  exampleSentence?: string | null;
  collectionId?: number | null;
  collectionIds?: Array<number | null> | null;
  knowledgeStatus?: string | null;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
}

export interface BackendFlashcardUpsertPayload {
  lemma: string;
  translation: string;
  sourceSentence: string;
  exampleSentence: string;
  knowledgeStatus: KnowledgeStatusValue;
  collectionId?: number;
  clearCollection?: boolean;
}

const KNOWLEDGE_STATUSES: KnowledgeStatusValue[] = ['KNOWN', 'LEARNING', 'UNKNOWN', 'IGNORED'];

function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
  }
  return Date.now();
}

function toKnowledgeStatus(value: unknown): KnowledgeStatusValue | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase() as KnowledgeStatusValue;
  return KNOWLEDGE_STATUSES.includes(normalized) ? normalized : undefined;
}

function toCollectionIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => Number(item))
    .filter(item => Number.isFinite(item));
}

export function mapBackendFlashcard(fc: BackendFlashcard, defaultDeckName = 'Syntagma'): FlashcardPayload {
  const collectionId = fc.collectionId != null ? Number(fc.collectionId) : null;
  const parsedCollectionIds = toCollectionIds(fc.collectionIds);
  const collectionIds = collectionId != null && !parsedCollectionIds.includes(collectionId)
    ? [collectionId, ...parsedCollectionIds]
    : parsedCollectionIds;

  return {
    id: String(fc.flashcardId ?? ''),
    lemma: fc.lemma ?? '',
    surfaceForm: fc.lemma ?? '',
    sentence: fc.sourceSentence ?? '',
    sourceUrl: '',
    sourceTitle: '',
    trMeaning: fc.translation ?? '',
    exampleSentence: fc.exampleSentence ?? '',
    knowledgeStatus: toKnowledgeStatus(fc.knowledgeStatus),
    createdAt: toTimestamp(fc.createdAt),
    updatedAt: toTimestamp(fc.updatedAt),
    deckName: defaultDeckName,
    tags: ['syntagma'],
    collectionId,
    collectionIds,
  };
}

export function buildBackendFlashcardPayload(
  card: FlashcardPayload,
  selectedCollectionId: number | null
): BackendFlashcardUpsertPayload {
  const payload: BackendFlashcardUpsertPayload = {
    lemma: card.lemma.trim().toLowerCase(),
    translation: card.trMeaning ?? '',
    sourceSentence: card.sentence ?? '',
    exampleSentence: card.exampleSentence ?? '',
    knowledgeStatus: card.knowledgeStatus ?? 'LEARNING',
  };

  if (selectedCollectionId == null) {
    payload.clearCollection = true;
  } else {
    payload.collectionId = Number(selectedCollectionId);
  }

  return payload;
}

export function mergeFlashcardWithLocalFields(localCard: FlashcardPayload, serverCard: FlashcardPayload): FlashcardPayload {
  return {
    ...serverCard,
    sourceUrl: localCard.sourceUrl,
    sourceTitle: localCard.sourceTitle,
    tags: localCard.tags,
    deckName: localCard.deckName || serverCard.deckName,
    screenshotDataUrl: localCard.screenshotDataUrl,
    audioUrl: localCard.audioUrl,
    sentenceAudioDataUrl: localCard.sentenceAudioDataUrl,
  };
}

export function resolvePreferredCollectionId(card: FlashcardPayload, fallbackCollectionId: number | null): number | null {
  if (card.collectionId != null) return Number(card.collectionId);
  if (card.collectionIds && card.collectionIds.length > 0) return Number(card.collectionIds[0]);
  return fallbackCollectionId;
}

export function cardMatchesCollection(card: FlashcardPayload, collectionId: number): boolean {
  if (card.collectionId != null && Number(card.collectionId) === Number(collectionId)) return true;
  return (card.collectionIds ?? []).some(id => Number(id) === Number(collectionId));
}

export function resolveCardCollectionLabel(
  card: FlashcardPayload,
  collectionNameById: Record<number, string>
): string {
  const ids: number[] = [];
  if (card.collectionId != null) ids.push(Number(card.collectionId));
  for (const id of card.collectionIds ?? []) {
    const numericId = Number(id);
    if (!ids.includes(numericId)) ids.push(numericId);
  }

  if (ids.length === 0) {
    return card.deckName || 'Syntagma';
  }

  return ids
    .map(id => collectionNameById[id] || `Collection #${id}`)
    .join(', ');
}

