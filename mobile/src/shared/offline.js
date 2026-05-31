import {
  fetchAllFlashcards,
  fetchAllVocabulary,
  fetchAllWordKnowledge,
  fetchCollectionReviewableCards,
  fetchCollections,
  fetchReviewStats,
  submitReview,
  updateWordKnowledge,
} from './api';
import {
  appendToQueue,
  getCache,
  getQueue,
  shiftQueue,
  getReviewDelta,
  incrementReviewDelta,
  getReviewedIds,
  addReviewedId,
  saveCache,
  clearAllReviewDeltas,
} from './storage';
import {
  CACHE_COLLECTIONS,
  CACHE_FLASHCARDS,
  CACHE_VOCABULARY,
  CACHE_WORD_KNOWLEDGE,
  buildCollectionMap,
  buildVocabularyItems,
  cacheCollectionKey,
  cacheCollectionReviewableIdsKey,
  cacheStatsKey,
  extractFlashcardIds,
  getCardCollectionIds,
  mapFlashcardsToCards,
  normalizeCollections,
  removeReviewableId,
} from './offline-cache';

const QUEUE_REVIEWS = 'syntagma.queue.reviews';
const QUEUE_WORDKNOWLEDGE = 'syntagma.queue.wordknowledge';

function todayStr() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function enqueueReview(review, lemma) {
  await appendToQueue(QUEUE_REVIEWS, { review, lemma, enqueuedAt: new Date().toISOString() });
}

export async function enqueueWordKnowledge(lemma, status) {
  await appendToQueue(QUEUE_WORDKNOWLEDGE, { lemma, status, enqueuedAt: new Date().toISOString() });
}

export async function flushQueues() {
  const reviewQueue = await getQueue(QUEUE_REVIEWS);
  for (const item of reviewQueue) {
    try {
      const response = await submitReview(item.review);
      await shiftQueue(QUEUE_REVIEWS);
      if ((response?.updatedSrsState?.scheduledDays ?? 0) >= 25 && item.lemma) {
        await updateWordKnowledge(item.lemma, 'KNOWN').catch(() =>
          enqueueWordKnowledge(item.lemma, 'KNOWN').catch(() => {})
        );
      }
    } catch {
      break;
    }
  }

  const remainingReviews = await getQueue(QUEUE_REVIEWS);
  if (remainingReviews.length === 0) {
    await clearAllReviewDeltas().catch(() => {});
  }

  const wkQueue = await getQueue(QUEUE_WORDKNOWLEDGE);
  for (const item of wkQueue) {
    try {
      await updateWordKnowledge(item.lemma, item.status);
      await shiftQueue(QUEUE_WORDKNOWLEDGE);
    } catch {
      break;
    }
  }

  const remainingKnowledge = await getQueue(QUEUE_WORDKNOWLEDGE);
  return {
    reviewsFlushed: remainingReviews.length === 0,
    wordKnowledgeFlushed: remainingKnowledge.length === 0,
  };
}

export async function prefetchOfflineData() {
  const [collectionsResult, flashcardsResult, knowledgeResult, vocabularyResult] = await Promise.allSettled([
    fetchCollections(),
    fetchAllFlashcards(),
    fetchAllWordKnowledge(),
    fetchAllVocabulary(),
  ]);

  const statsResults = await Promise.allSettled([
    fetchReviewStats('week'),
    fetchReviewStats('month'),
    fetchReviewStats('year'),
    fetchReviewStats('all'),
  ]);

  const collections = collectionsResult.status === 'fulfilled'
    ? normalizeCollections(collectionsResult.value)
    : null;

  if (collections) {
    await saveCache(CACHE_COLLECTIONS, collections).catch(() => {});
  }

  const flashcards = flashcardsResult.status === 'fulfilled' && Array.isArray(flashcardsResult.value)
    ? flashcardsResult.value
    : null;
  const knowledge = knowledgeResult.status === 'fulfilled' && Array.isArray(knowledgeResult.value)
    ? knowledgeResult.value
    : null;
  const vocabulary = vocabularyResult.status === 'fulfilled' && Array.isArray(vocabularyResult.value)
    ? vocabularyResult.value
    : null;

  if (flashcards) {
    await saveCache(CACHE_FLASHCARDS, flashcards).catch(() => {});

    const collectionMap = buildCollectionMap(flashcards, collections);
    const saveTasks = Array.from(collectionMap.entries()).map(([id, cards]) =>
      saveCache(cacheCollectionKey(id), mapFlashcardsToCards(cards)).catch(() => {})
    );
    await Promise.all(saveTasks);
  }

  if (collections) {
    const reviewableTasks = collections.map(async (col) => {
      const id = Number(col?.collectionId ?? col?.id);
      if (!Number.isFinite(id)) {
        return;
      }

      try {
        const reviewable = await fetchCollectionReviewableCards(id);
        await saveCache(
          cacheCollectionReviewableIdsKey(id),
          extractFlashcardIds(reviewable)
        ).catch(() => {});
      } catch {
        // Best effort cache refresh; stale cached ids can still be used offline.
      }
    });
    await Promise.all(reviewableTasks);
  }

  if (knowledge) {
    await saveCache(CACHE_WORD_KNOWLEDGE, knowledge).catch(() => {});
  }

  if (vocabulary) {
    await saveCache(CACHE_VOCABULARY, vocabulary).catch(() => {});
  } else if (flashcards || knowledge) {
    const existingVocabulary = await getCache(CACHE_VOCABULARY).catch(() => null);
    if (!Array.isArray(existingVocabulary) || existingVocabulary.length === 0) {
      const cachedFlashcards = flashcards || await getCache(CACHE_FLASHCARDS).catch(() => []);
      const cachedKnowledge = knowledge || await getCache(CACHE_WORD_KNOWLEDGE).catch(() => []);
      const derivedVocabulary = buildVocabularyItems(cachedFlashcards || [], cachedKnowledge || []);
      await saveCache(CACHE_VOCABULARY, derivedVocabulary).catch(() => {});
    }
  }

  const [weekStats, monthStats, yearStats, allStats] = statsResults;
  if (weekStats?.status === 'fulfilled') {
    await saveCache(cacheStatsKey('WEEK'), weekStats.value).catch(() => {});
  }
  if (monthStats?.status === 'fulfilled') {
    await saveCache(cacheStatsKey('MONTH'), monthStats.value).catch(() => {});
  }
  if (yearStats?.status === 'fulfilled') {
    await saveCache(cacheStatsKey('YEARLY'), yearStats.value).catch(() => {});
  }
  if (allStats?.status === 'fulfilled') {
    await saveCache(cacheStatsKey('ALL'), allStats.value).catch(() => {});
  }
}

export async function getReviewDeltaToday() {
  return getReviewDelta(todayStr());
}

export async function bumpDelta() {
  await incrementReviewDelta(todayStr());
}

export async function getReviewedIdsToday() {
  return getReviewedIds(todayStr());
}

export async function markCardReviewed(cardId) {
  await addReviewedId(todayStr(), cardId);
}

export async function recordCardReviewedLocally(card, collectionId = null) {
  const cardId = card?.flashcardId ?? card?.id;
  if (cardId == null) {
    return;
  }

  await markCardReviewed(cardId);

  const ids = new Set();
  const numericCollectionId = Number(collectionId);
  if (Number.isFinite(numericCollectionId)) {
    ids.add(numericCollectionId);
  }

  for (const id of getCardCollectionIds(card)) {
    ids.add(id);
  }

  await Promise.all(Array.from(ids).map(async (id) => {
    const key = cacheCollectionReviewableIdsKey(id);
    const reviewableIds = await getCache(key).catch(() => null);
    if (!Array.isArray(reviewableIds)) {
      return;
    }

    await saveCache(key, removeReviewableId(reviewableIds, cardId)).catch(() => {});
  }));
}
