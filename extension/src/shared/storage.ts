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
  targetSubtitleSize: 150,
  secondarySubtitleSize: 120,
  subtitleOverlayOpacity: 0.15,
  pauseOnWordInteraction: true,
  resumeAfterInteraction: true,
  resumeDelayMs: 1000,
  sceneSkipMode: 'off',
  removeBracketedSubtitles: true,
  revealOnPause: true,
  revealOnHover: true,
  revealByKnownStatus: true,
  autoPauseDelayToleranceMs: 0,
  targetSubtitleOffsetMs: 0,
  secondarySubtitleOffsetMs: 0,
  interactionDelayMs: 0,
  showSubtitleSidebar: true,
  aiModel: 'meta-llama/llama-3.3-70b-instruct:free',
  aiApiKey: null,
  forvoApiKey: null,
  ankiConnectUrl: 'http://localhost:8765',
  ankiDeckName: 'Syntagma',
  apiBaseUrl: '',
  authToken: null,
  authEmail: null,
  authUserId: null,
  activeCollectionId: null,
  activeCollectionName: null,
};

export function getAuthHeaders(settings: UserSettings): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.authToken) {
    headers['Authorization'] = `Bearer ${settings.authToken}`;
  }
  return headers;
}

export async function getSettings(): Promise<UserSettings> {
  const result = await chrome.storage.local.get('userSettings');
  return { ...DEFAULT_SETTINGS, ...(result.userSettings ?? {}) };
}

export async function setSettings(patch: Partial<UserSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ userSettings: { ...current, ...patch } });
}

export function userScopedKey(base: string, userId: string | null | undefined): string {
  return userId ? `${base}_${userId}` : base;
}

async function resolveUserId(): Promise<string | null> {
  const result = await chrome.storage.local.get('userSettings');
  return (result.userSettings as UserSettings | undefined)?.authUserId ?? null;
}

export async function getLexemes(): Promise<Record<string, LexemeEntry>> {
  const userId = await resolveUserId();
  const key = userScopedKey('lexemes', userId);
  const result = await chrome.storage.local.get(key);
  return (result[key] ?? {}) as Record<string, LexemeEntry>;
}

export async function setLexemeStatus(lemma: string, status: WordStatus): Promise<void> {
  const userId = await resolveUserId();
  const key = userScopedKey('lexemes', userId);
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
  await chrome.storage.local.set({ [key]: lexemes });
}

export async function bulkSetLexemeStatus(lemmas: string[], status: WordStatus): Promise<void> {
  const userId = await resolveUserId();
  const key = userScopedKey('lexemes', userId);
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
  await chrome.storage.local.set({ [key]: lexemes });
}

export async function updateLexemeEntry(lemma: string, patch: Partial<LexemeEntry>): Promise<void> {
  const userId = await resolveUserId();
  const key = userScopedKey('lexemes', userId);
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
  await chrome.storage.local.set({ [key]: lexemes });
}

export async function getFlashcards(): Promise<FlashcardPayload[]> {
  const userId = await resolveUserId();
  const key = userScopedKey('flashcards', userId);
  const result = await chrome.storage.local.get(key);
  return (result[key] ?? []) as FlashcardPayload[];
}

export async function saveFlashcard(card: FlashcardPayload): Promise<void> {
  const userId = await resolveUserId();
  const key = userScopedKey('flashcards', userId);
  const cards = await getFlashcards();
  cards.push(card);
  await chrome.storage.local.set({ [key]: cards });
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
