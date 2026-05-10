import type { CEFRLevel, LearnerLevel } from './types';
import { getLexemes, bulkSetLexemeStatus, getSettings, getAuthHeaders } from './storage';

const BACKEND_URL = 'https://syntagma.omerhanyigit.online';

const LEVEL_TO_CEFR: Record<LearnerLevel, CEFRLevel[]> = {
  'beginner':           ['A1'],
  'elementary':         ['A1', 'A2'],
  'intermediate':       ['A1', 'A2', 'B1'],
  'upper-intermediate': ['A1', 'A2', 'B1', 'B2'],
  'advanced':           ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
};

export function getCefrLevelsForLearner(level: LearnerLevel): CEFRLevel[] {
  return LEVEL_TO_CEFR[level] ?? ['A1'];
}

async function loadCefrWordList(): Promise<Record<CEFRLevel, string[]>> {
  const url = chrome.runtime.getURL('assets/cefr-words-en.json');
  const res = await fetch(url);
  return res.json();
}

/**
 * Mark all CEFR words at or below the given learner level as 'known'.
 * Skips words already marked known to avoid redundant writes.
 * Returns the count of newly marked words.
 */
export async function applyKnownWordsForLevel(level: LearnerLevel): Promise<number> {
  const cefrLevels = getCefrLevelsForLearner(level);
  const wordList = await loadCefrWordList();

  const allWords: string[] = [];
  for (const lvl of cefrLevels) {
    if (wordList[lvl]) allWords.push(...wordList[lvl]);
  }

  const lexemes = await getLexemes();
  const newWords = allWords.filter(w => lexemes[w]?.status !== 'known');

  if (newWords.length === 0) return 0;

  const settings = await getSettings();
  const apiBase = settings.apiBaseUrl || BACKEND_URL;

  // Chunk to avoid oversized storage writes and API payloads
  const CHUNK = 500;
  for (let i = 0; i < newWords.length; i += CHUNK) {
    const chunk = newWords.slice(i, i + CHUNK);
    await bulkSetLexemeStatus(chunk, 'known');
    
    if (settings.authToken) {
      try {
        const res = await fetch(`${apiBase}/api/word-knowledge/known-words`, {
          method: 'POST',
          headers: getAuthHeaders(settings),
          body: JSON.stringify({ knownWords: chunk }),
        });
        if (!res.ok) {
          console.warn(`[Syntagma] Backend sync failed for chunk: ${res.status}`);
        }
      } catch (err) {
        console.warn('[Syntagma] Backend sync error:', err);
      }
    }
  }

  console.log(`[Syntagma] CEFR intake: marked ${newWords.length} words as known for level ${level}`);
  return newWords.length;
}
