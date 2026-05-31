export const CACHE_COLLECTIONS = 'syntagma.cache.collections';
export const CACHE_FLASHCARDS = 'syntagma.cache.flashcards.all.v1';
export const CACHE_WORD_KNOWLEDGE = 'syntagma.cache.wordknowledge.all.v1';
export const CACHE_VOCABULARY = 'syntagma.cache.vocabulary.all.v1';
export const CACHE_DAILY = 'syntagma.cache.daily';

export const cacheCollectionKey = (id) => `syntagma.cache.collection.${id}`;
export const cacheCollectionReviewableIdsKey = (id) =>
  `syntagma.cache.collection.${id}.reviewableIds.v1`;
export const cacheStatsKey = (period) => `syntagma.cache.reviewstats.${period}`;

const VALID_STATUSES = new Set(['KNOWN', 'LEARNING', 'UNKNOWN', 'IGNORED']);

export const normalizeLemma = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export const normalizeSearch = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export const normalizeCollections = (data) =>
  Array.isArray(data)
    ? data
    : Array.isArray(data?.content)
      ? data.content
      : Array.isArray(data?.collections)
        ? data.collections
        : [];

export const readVocabularyPage = (data, pageSize) => {
  const content = Array.isArray(data?.content)
    ? data.content
    : Array.isArray(data)
      ? data
      : [];
  return {
    content,
    last: data?.last === true || content.length < pageSize,
    totalElements: Number.isFinite(data?.totalElements) ? data.totalElements : null,
  };
};

export const vocabularyPageCacheKey = (filter, search, page) =>
  `syntagma.cache.vocabulary.${filter}.${normalizeSearch(search) || 'all'}.${page}.v1`;

export const normalizeStatus = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const upper = value.trim().toUpperCase();
  return VALID_STATUSES.has(upper) ? upper : null;
};

export const mapFlashcardsToCards = (items) =>
  items.map((item) => {
    const sentence = item.sourceSentence || item.sentence || '';
    return {
      id: item.id ?? item.flashcardId,
      flashcardId: item.flashcardId ?? item.id,
      collectionId: item.collectionId ?? null,
      collectionIds: Array.isArray(item.collectionIds) ? item.collectionIds : [],
      knowledgeStatus: item.knowledgeStatus || item.status || null,
      word: item.lemma || item.word || 'Unknown',
      lemma: item.lemma || item.word || 'Unknown',
      phonetic: item.phonetic || '',
      sentence,
      exampleSentence: item.exampleSentence || '',
      sourceSentence: item.sourceSentence || item.sentence || '',
      translation: item.translation || item.trMeaning || '',
      usageNote: item.usageNote || '',
      sentenceTranslation: item.sentenceTranslation || '',
      sourceTitle: item.sourceTitle || '',
      sourceUrl: item.sourceUrl || '',
      videoTimestamp: item.videoTimestamp ?? null,
      audioUrl: item.audioUrl || '',
      sentenceAudioDataUrl: item.sentenceAudioDataUrl || '',
      englishPronunciationUri: item.englishPronunciationUri || '',
      turkishPronunciationUri: item.turkishPronunciationUri || '',
      imageUri: item.imageUri || item.imageUrl || item.screenshotDataUrl || '',
      imageUrl: item.imageUrl || item.imageUri || item.screenshotDataUrl || '',
      screenshotDataUrl: item.screenshotDataUrl || '',
      createdAt: item.createdAt ?? null,
      updatedAt: item.updatedAt ?? null,
    };
  });

export const getCardCollectionIds = (card) => {
  const ids = Array.isArray(card?.collectionIds) ? card.collectionIds : [];
  const allIds = ids.slice();
  if (card?.collectionId != null) {
    allIds.push(card.collectionId);
  }
  return Array.from(new Set(
    allIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
  ));
};

export const buildCollectionMap = (flashcards, collections) => {
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

export const buildVocabularyItems = (flashcards, knowledge) => {
  const merged = new Map();

  for (const item of Array.isArray(knowledge) ? knowledge : []) {
    const lemma = typeof item?.lemma === 'string' ? item.lemma.trim() : '';
    const lemmaKey = normalizeLemma(lemma || item?.word);
    const status = normalizeStatus(item?.status) || 'LEARNING';
    if (!lemmaKey || status === 'UNKNOWN') {
      continue;
    }

    merged.set(lemmaKey, {
      lemma: lemma || item?.word || lemmaKey,
      lemmaKey,
      status,
      updatedAt: item?.updatedAt ?? null,
    });
  }

  for (const card of Array.isArray(flashcards) ? flashcards : []) {
    const lemma = typeof card?.lemma === 'string'
      ? card.lemma.trim()
      : typeof card?.word === 'string'
        ? card.word.trim()
        : '';
    const lemmaKey = normalizeLemma(lemma);
    if (!lemmaKey || merged.has(lemmaKey)) {
      continue;
    }

    const status = normalizeStatus(card?.knowledgeStatus) || 'LEARNING';
    merged.set(lemmaKey, {
      lemma: lemma || lemmaKey,
      lemmaKey,
      status: status === 'UNKNOWN' ? 'LEARNING' : status,
      updatedAt: card?.updatedAt ?? card?.createdAt ?? null,
    });
  }

  return Array.from(merged.values()).sort((a, b) => a.lemmaKey.localeCompare(b.lemmaKey));
};

export const filterVocabularyItems = (items, status = 'ALL', search = '') => {
  const statusFilter = normalizeStatus(status);
  const searchTerm = normalizeSearch(search);

  return (Array.isArray(items) ? items : []).filter((item) => {
    const itemStatus = normalizeStatus(item?.status) || 'LEARNING';
    if (statusFilter && statusFilter !== 'UNKNOWN' && statusFilter !== itemStatus) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    const lemmaKey = normalizeLemma(item?.lemmaKey || item?.lemma);
    return lemmaKey.includes(searchTerm);
  });
};

export const paginateVocabularyItems = (items, page, pageSize, status = 'ALL', search = '') => {
  const filtered = filterVocabularyItems(items, status, search);
  const start = Math.max(0, page) * pageSize;
  const content = filtered.slice(start, start + pageSize);
  return {
    content,
    last: start + pageSize >= filtered.length,
    totalElements: filtered.length,
  };
};

export const updateVocabularyStatus = (items, lemmaKey, status) => {
  const normalizedKey = normalizeLemma(lemmaKey);
  const normalizedStatus = normalizeStatus(status) || 'LEARNING';
  if (!normalizedKey) {
    return Array.isArray(items) ? items : [];
  }

  return (Array.isArray(items) ? items : [])
    .map((item) =>
      normalizeLemma(item?.lemmaKey || item?.lemma) === normalizedKey
        ? { ...item, lemmaKey: item.lemmaKey || normalizedKey, status: normalizedStatus, updatedAt: new Date().toISOString() }
        : item
    )
    .sort((a, b) => normalizeLemma(a?.lemmaKey || a?.lemma).localeCompare(normalizeLemma(b?.lemmaKey || b?.lemma)));
};

export const getDailyCardIdSet = (daily) => {
  if (!Array.isArray(daily?.cards)) {
    return null;
  }

  return new Set(
    daily.cards
      .map((entry) => entry?.flashcardId ?? entry?.id)
      .filter((id) => id != null)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
  );
};

export const extractFlashcardIds = (items) =>
  Array.from(new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => item?.flashcardId ?? item?.id)
      .filter((id) => id != null)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
  ));

export const removeReviewableId = (reviewableIds, cardId) => {
  const id = Number(cardId);
  if (!Array.isArray(reviewableIds) || !Number.isFinite(id)) {
    return Array.isArray(reviewableIds) ? reviewableIds : [];
  }

  return reviewableIds
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item !== id);
};

export const filterReviewableCards = (cards, reviewableIds, reviewedIds = []) => {
  const idSet = new Set(
    (Array.isArray(reviewableIds) ? reviewableIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
  );
  const reviewedSet = new Set((Array.isArray(reviewedIds) ? reviewedIds : []).map(String));

  if (!idSet.size) {
    return [];
  }

  return (Array.isArray(cards) ? cards : [])
    .filter((card) => {
      const cardId = Number(card?.flashcardId ?? card?.id);
      return Number.isFinite(cardId) && idSet.has(cardId);
    })
    .filter((card) => !reviewedSet.has(String(card?.flashcardId ?? card?.id)));
};

export const applyOfflineCollectionCounts = (
  collections,
  collectionCardsById,
  collectionReviewableIdsById,
  reviewedIds = []
) =>
  (Array.isArray(collections) ? collections : []).map((collection) => {
    const id = Number(collection?.collectionId ?? collection?.id);
    const cachedCards = Number.isFinite(id) ? collectionCardsById?.[id] : null;
    const reviewableIds = Number.isFinite(id) ? collectionReviewableIdsById?.[id] : null;
    if (!Array.isArray(cachedCards)) {
      return collection;
    }

    return {
      ...collection,
      itemsCount: cachedCards.length,
      reviewableCount: filterReviewableCards(cachedCards, reviewableIds, reviewedIds).length,
    };
  });

export const applyLocalReviewableCountOverlay = (
  collections,
  collectionCardsById,
  collectionReviewableIdsById,
  reviewedIds = []
) =>
  (Array.isArray(collections) ? collections : []).map((collection) => {
    const id = Number(collection?.collectionId ?? collection?.id);
    const cachedCards = Number.isFinite(id) ? collectionCardsById?.[id] : null;
    const reviewableIds = Number.isFinite(id) ? collectionReviewableIdsById?.[id] : null;
    if (!Array.isArray(cachedCards) || !Array.isArray(reviewableIds)) {
      return collection;
    }

    const localCount = filterReviewableCards(cachedCards, reviewableIds, reviewedIds).length;
    const serverCount = Number(collection?.reviewableCount);
    return {
      ...collection,
      reviewableCount: Number.isFinite(serverCount)
        ? Math.min(serverCount, localCount)
        : localCount,
    };
  });
