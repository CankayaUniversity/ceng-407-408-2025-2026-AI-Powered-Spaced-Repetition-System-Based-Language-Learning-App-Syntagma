import type { CEFRLevel, LearnerLevel } from './types';
import { bulkSetLexemeStatus, getSettings, getAuthHeaders, getLexemes } from './storage';
import { getAllCefrWords, getCefrWordsUpTo } from './cefr-level-words';

const BACKEND_URL = 'https://syntagma.omerhanyigit.online';

const LEVEL_TO_CEFR: Record<LearnerLevel, CEFRLevel> = {
  'beginner': 'A1',
  'elementary': 'A2',
  'intermediate': 'B1',
  'upper-intermediate': 'B2',
  'advanced': 'C2',
};

function getCefrLevelForLearner(level: LearnerLevel): CEFRLevel {
  return LEVEL_TO_CEFR[level] ?? 'A1';
}

type BackendKnowledgeStatus = 'KNOWN' | 'UNKNOWN';
const BATCH_CHUNK_SIZE = 500;

async function batchSetStatusOnBackend(
  apiBase: string,
  headers: Record<string, string>,
  lemmas: string[],
  status: BackendKnowledgeStatus,
): Promise<void> {
  for (let i = 0; i < lemmas.length; i += BATCH_CHUNK_SIZE) {
    const chunk = lemmas.slice(i, i + BATCH_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const res = await fetch(`${apiBase}/api/word-knowledge/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        entries: chunk.map(lemma => ({ lemma, status })),
      }),
    });
    if (!res.ok) {
      throw new Error(`Batch ${status} sync failed: ${res.status}`);
    }
  }
}

async function fetchLemmasByStatusFromBackend(
  apiBase: string,
  headers: Record<string, string>,
  status: BackendKnowledgeStatus,
): Promise<string[]> {
  const lemmas: string[] = [];
  const size = 200;
  let page = 0;

  while (true) {
    const res = await fetch(`${apiBase}/api/word-knowledge?status=${status}&size=${size}&page=${page}`, {
      headers,
    });
    if (!res.ok) throw new Error(`${status} words fetch failed: ${res.status}`);
    const json = await res.json();
    const content = json.data?.content ?? json.data ?? [];
    if (!Array.isArray(content) || content.length === 0) break;
    for (const wk of content) {
      if (wk?.lemma) lemmas.push(String(wk.lemma));
    }
    if (content.length < size) break;
    page += 1;
  }

  return lemmas;
}

/**
 * Ask backend to mark all words up to the given CEFR level as 'known',
 * then sync the local lexeme cache from the server.
 * Returns the count of newly marked words reported by the backend.
 */
export async function applyKnownWordsForLevel(level: LearnerLevel): Promise<number> {
  const settings = await getSettings();
  if (!settings.authToken || !settings.authUserId) {
    console.warn('[Syntagma] CEFR intake skipped: missing auth token or user id');
    return 0;
  }
  const apiBase = settings.apiBaseUrl || BACKEND_URL;
  const headers = {
    ...getAuthHeaders(settings),
    'X-User-Id': settings.authUserId,
  };

  const cefrLevel = getCefrLevelForLearner(level);
  const res = await fetch(`${apiBase}/api/word-knowledge/level`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ level: cefrLevel }),
  });
  if (!res.ok) {
    console.warn(`[Syntagma] CEFR intake failed: ${res.status}`);
    return 0;
  }
  const json = await res.json();
  const updated = Number(json?.data?.updated ?? 0);

  const targetKnownSet = new Set(getCefrWordsUpTo(cefrLevel));
  const allCefrWords = getAllCefrWords();
  const wordsOutsideTarget = allCefrWords.filter(lemma => !targetKnownSet.has(lemma));
  if (wordsOutsideTarget.length > 0) {
    await batchSetStatusOnBackend(apiBase, headers, wordsOutsideTarget, 'UNKNOWN');
  }

  const [knownLemmas, localLexemes] = await Promise.all([
    fetchLemmasByStatusFromBackend(apiBase, headers, 'KNOWN'),
    getLexemes(),
  ]);

  const allCefrSet = new Set(allCefrWords);
  const knownLocallyOutsideTarget = Object.values(localLexemes)
    .filter(entry => entry.status === 'known')
    .map(entry => String(entry.lemma ?? '').toLowerCase())
    .filter(lemma => allCefrSet.has(lemma) && !targetKnownSet.has(lemma));
  if (knownLocallyOutsideTarget.length > 0) {
    await bulkSetLexemeStatus(knownLocallyOutsideTarget, 'unknown');
  }

  const knownWithinTarget = knownLemmas
    .map(lemma => lemma.toLowerCase())
    .filter(lemma => targetKnownSet.has(lemma));
  if (knownWithinTarget.length > 0) {
    await bulkSetLexemeStatus(knownWithinTarget, 'known');
  }

  console.log(`[Syntagma] CEFR intake: marked ${updated} words as known for level ${level}`);
  return updated;
}
