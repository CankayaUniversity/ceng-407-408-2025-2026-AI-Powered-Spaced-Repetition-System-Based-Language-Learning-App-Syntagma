const VALID_STATUSES = new Set(['KNOWN', 'LEARNING', 'UNKNOWN', 'IGNORED']);

const normalizeLemma = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const normalizeStatus = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const upper = value.trim().toUpperCase();
  return VALID_STATUSES.has(upper) ? upper : null;
};

export function computeKnownWordsStats(flashcards, knowledge) {
  const wkMap = new Map();
  for (const item of knowledge) {
    const lemmaValue = item?.lemma ?? item?.word;
    const lemmaKey = normalizeLemma(lemmaValue);
    if (!lemmaKey) {
      continue;
    }

    const status = normalizeStatus(item?.status) || 'LEARNING';
    wkMap.set(lemmaKey, status);
  }

  const merged = new Map();
  for (const card of flashcards) {
    const lemmaValue = card?.lemma ?? card?.word;
    const lemmaKey = normalizeLemma(lemmaValue);
    if (!lemmaKey) {
      continue;
    }

    const status = wkMap.get(lemmaKey) || normalizeStatus(card?.knowledgeStatus) || 'LEARNING';
    merged.set(lemmaKey, status);
  }

  for (const [lemmaKey, status] of wkMap.entries()) {
    if (!merged.has(lemmaKey)) {
      merged.set(lemmaKey, status);
    }
  }

  let knownCount = 0;
  for (const status of merged.values()) {
    if (status === 'KNOWN') {
      knownCount += 1;
    }
  }

  return {
    knownCount,
    totalCount: merged.size,
  };
}
