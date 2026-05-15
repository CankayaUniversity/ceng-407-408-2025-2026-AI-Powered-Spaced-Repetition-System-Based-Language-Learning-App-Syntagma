import {
  fetchAllFlashcards,
  fetchAllWordKnowledge,
  fetchCollections,
  fetchDailyCards,
  fetchReviewStats,
  submitReview,
  updateWordKnowledge,
} from './api';
import {
  appendToQueue,
  getQueue,
  shiftQueue,
  getReviewDelta,
  incrementReviewDelta,
  getReviewedIds,
  addReviewedId,
  saveCache,
  clearAllReviewDeltas,
} from './storage';

const QUEUE_REVIEWS = 'syntagma.queue.reviews';
const QUEUE_WORDKNOWLEDGE = 'syntagma.queue.wordknowledge';
const CACHE_COLLECTIONS = 'syntagma.cache.collections';
const CACHE_FLASHCARDS = 'syntagma.cache.flashcards.all.v1';
const CACHE_WORD_KNOWLEDGE = 'syntagma.cache.wordknowledge.all.v1';
const CACHE_DAILY = 'syntagma.cache.daily';
const cacheCollectionKey = (id) => `syntagma.cache.collection.${id}`;
const cacheStatsKey = (period) => `syntagma.cache.reviewstats.${period}`;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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

const normalizeCollections = (data) =>
  Array.isArray(data)
    ? data
    : Array.isArray(data?.content)
      ? data.content
      : Array.isArray(data?.collections)
        ? data.collections
        : [];

const mapFlashcardsToCards = (items) =>
  items.map((item) => ({
    flashcardId: item.flashcardId ?? item.id,
    word: item.lemma || item.word || 'Unknown',
    phonetic: '',
    sentence: item.exampleSentence || item.sourceSentence || '',
    translation: item.translation || '',
    sentenceTranslation: '',
  }));

const getCardCollectionIds = (card) => {
  const ids = Array.isArray(card?.collectionIds) ? card.collectionIds : [];
  const allIds = ids.slice();
  if (card?.collectionId != null) {
    allIds.push(card.collectionId);
  }
  return allIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
};

const buildCollectionMap = (flashcards, collections) => {
  const map = new Map();
  if (Array.isArray(collections)) {
    for (const col of collections) {
      const id = Number(col?.collectionId ?? col?.id);
      if (Number.isFinite(id)) {
        map.set(id, []);
      }
    }
  }

  for (const card of flashcards) {
    const ids = getCardCollectionIds(card);
    for (const id of ids) {
      if (!map.has(id)) {
        map.set(id, []);
      }
      map.get(id).push(card);
    }
  }

  return map;
};

export async function prefetchOfflineData() {
  const [collectionsResult, flashcardsResult, knowledgeResult, dailyResult] = await Promise.allSettled([
    fetchCollections(),
    fetchAllFlashcards(),
    fetchAllWordKnowledge(),
    fetchDailyCards(),
  ]);

  const statsResults = await Promise.allSettled([
    fetchReviewStats('week'),
    fetchReviewStats('month'),
    fetchReviewStats('all'),
  ]);

  const collections = collectionsResult.status === 'fulfilled'
    ? normalizeCollections(collectionsResult.value)
    : null;

  if (collections) {
    await saveCache(CACHE_COLLECTIONS, collections).catch(() => {});
  }

  if (flashcardsResult.status === 'fulfilled') {
    const flashcards = Array.isArray(flashcardsResult.value) ? flashcardsResult.value : [];
    await saveCache(CACHE_FLASHCARDS, flashcards).catch(() => {});

    if (flashcards.length) {
      const collectionMap = buildCollectionMap(flashcards, collections);
      const saveTasks = Array.from(collectionMap.entries()).map(([id, cards]) =>
        saveCache(cacheCollectionKey(id), mapFlashcardsToCards(cards)).catch(() => {})
      );
      await Promise.all(saveTasks);
    }
  }

  if (knowledgeResult.status === 'fulfilled') {
    const knowledge = Array.isArray(knowledgeResult.value) ? knowledgeResult.value : [];
    await saveCache(CACHE_WORD_KNOWLEDGE, knowledge).catch(() => {});
  }

  if (dailyResult.status === 'fulfilled') {
    await saveCache(CACHE_DAILY, dailyResult.value).catch(() => {});
  }

  const [weekStats, monthStats, allStats] = statsResults;
  if (weekStats?.status === 'fulfilled') {
    await saveCache(cacheStatsKey('WEEK'), weekStats.value).catch(() => {});
  }
  if (monthStats?.status === 'fulfilled') {
    await saveCache(cacheStatsKey('MONTH'), monthStats.value).catch(() => {});
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
