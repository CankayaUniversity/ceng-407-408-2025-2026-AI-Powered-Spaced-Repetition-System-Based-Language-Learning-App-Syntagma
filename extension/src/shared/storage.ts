import type { UserSettings, LexemeEntry, WordStatus, FlashcardPayload, ComprehensionStats } from './types';

export const DEFAULT_SETTINGS: UserSettings = {
  enabled: true,
  supportLocale: 'tr',
  targetLanguage: 'en',
  learnerLevel: 'intermediate',
  showComprehensionHeader: true,
  showInlineTranslations: false,
  showLearningStatusColors: true,
  hideRareWords: false,
  autoParseOnLoad: true,
  readerEnableInlineTranslations: true,
  readerShowLearningStatusColors: true,
  readerAutoParseChapterOnOpen: true,
  readerDefaultFontSize: 18,
  readerLineHeight: 1.7,
  readerTheme: 'light',
  autoPauseMode: 'off',
  subtitleDualMode: false,
  targetSubtitleObscure: 'off',
  secondarySubtitleObscure: 'off',
  targetSubtitleSize: 90,
  secondarySubtitleSize: 100,
  subtitleOverlayOpacity: 0.6,
  pauseOnWordInteraction: true,
  resumeAfterInteraction: true,
  resumeDelayMs: 1000,
  sceneSkipMode: 'off',
  removeBracketedSubtitles: true,
  aiModel: 'meta-llama/llama-3.3-70b-instruct:free',
  aiApiKey: null,
  forvoApiKey: null,
  ankiConnectUrl: 'http://localhost:8765',
  ankiDeckName: 'Syntagma',
  apiBaseUrl: '',
  authToken: null,
};

export async function getSettings(): Promise<UserSettings> {
  const result = await chrome.storage.local.get('userSettings');
  return { ...DEFAULT_SETTINGS, ...(result.userSettings ?? {}) };
}

export async function setSettings(patch: Partial<UserSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ userSettings: { ...current, ...patch } });
}

export async function getLexemes(): Promise<Record<string, LexemeEntry>> {
  const result = await chrome.storage.local.get('lexemes');
  return (result.lexemes ?? {}) as Record<string, LexemeEntry>;
}

export async function setLexemeStatus(lemma: string, status: WordStatus): Promise<void> {
  const lexemes = await getLexemes();
  const now = Date.now();
  if (lexemes[lemma]) {
    lexemes[lemma].status = status;
    lexemes[lemma].lastSeenAt = now;
  } else {
    lexemes[lemma] = {
      key: lemma,
      lemma,
      surface: lemma,
      type: 'word',
      status,
      seenCount: 1,
      lastSeenAt: now,
      createdAt: now,
    };
  }
  await chrome.storage.local.set({ lexemes });
}

export async function bulkSetLexemeStatus(lemmas: string[], status: WordStatus): Promise<void> {
  const lexemes = await getLexemes();
  const now = Date.now();
  for (const lemma of lemmas) {
    if (lexemes[lemma]) {
      lexemes[lemma].status = status;
      lexemes[lemma].lastSeenAt = now;
    } else {
      lexemes[lemma] = {
        key: lemma,
        lemma,
        surface: lemma,
        type: 'word',
        status,
        seenCount: 1,
        lastSeenAt: now,
        createdAt: now,
      };
    }
  }
  await chrome.storage.local.set({ lexemes });
}

export async function updateLexemeEntry(lemma: string, patch: Partial<LexemeEntry>): Promise<void> {
  const lexemes = await getLexemes();
  const now = Date.now();
  if (lexemes[lemma]) {
    Object.assign(lexemes[lemma], patch, { lastSeenAt: now });
  } else {
    lexemes[lemma] = {
      key: lemma,
      lemma,
      surface: lemma,
      type: 'word',
      status: 'unknown',
      seenCount: 1,
      lastSeenAt: now,
      createdAt: now,
      ...patch,
    };
  }
  await chrome.storage.local.set({ lexemes });
}

export async function getFlashcards(): Promise<FlashcardPayload[]> {
  const result = await chrome.storage.local.get('flashcards');
  return (result.flashcards ?? []) as FlashcardPayload[];
}

export async function saveFlashcard(card: FlashcardPayload): Promise<void> {
  const cards = await getFlashcards();
  cards.push(card);
  await chrome.storage.local.set({ flashcards: cards });
}

export async function getComprehensionStats(pageUrl: string): Promise<ComprehensionStats | null> {
  const result = await chrome.storage.local.get('comprehensionStats');
  const stats = (result.comprehensionStats ?? {}) as Record<string, ComprehensionStats>;
  return stats[pageUrl] ?? null;
}

export async function setComprehensionStats(stats: ComprehensionStats): Promise<void> {
  const result = await chrome.storage.local.get('comprehensionStats');
  const all = (result.comprehensionStats ?? {}) as Record<string, ComprehensionStats>;
  all[stats.pageUrl] = stats;
  await chrome.storage.local.set({ comprehensionStats: all });
}
