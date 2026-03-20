// ─── Core Vocabulary ───────────────────────────────────────────────────────

export type WordStatus = 'unknown' | 'learning' | 'known' | 'ignored';
export type FrequencyBand = 'very-common' | 'common' | 'medium' | 'rare';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type LearnerLevel = 'beginner' | 'elementary' | 'intermediate' | 'upper-intermediate' | 'advanced';

export interface LexemeEntry {
  key: string;
  lemma: string;
  surface: string;
  type: 'word' | 'phrase';
  status: WordStatus;
  trMeaning?: string;
  audioUrl?: string;
  cefr?: CEFRLevel;
  frequencyRank?: number;
  frequencyBand?: FrequencyBand;
  zipfScore?: number;
  seenCount: number;
  lastSeenAt: number;
  createdAt: number;
  notes?: string;
}

export interface ComprehensionStats {
  pageUrl: string;
  pageTitle: string;
  totalTokenCount: number;
  knownTokenCount: number;
  learningTokenCount: number;
  unknownTokenCount: number;
  ignoredTokenCount: number;
  comprehensionPercent: number;
  calculatedAt: number;
}

export interface FlashcardPayload {
  id: string;
  lemma: string;
  surfaceForm: string;
  sentence: string;
  sourceUrl: string;
  sourceTitle: string;
  trMeaning: string;
  audioUrl?: string;
  screenshotDataUrl?: string;
  videoTimestamp?: number;
  createdAt: number;
  deckName: string;
  tags: string[];
}

export interface UserSettings {
  enabled: boolean;
  supportLocale: 'tr';
  targetLanguage: 'en';
  learnerLevel: LearnerLevel;
  showComprehensionHeader: boolean;
  showInlineTranslations: boolean;
  showLearningStatusColors: boolean;
  hideRareWords: boolean;
  autoParseOnLoad: boolean;
  readerEnableInlineTranslations: boolean;
  readerShowLearningStatusColors: boolean;
  readerAutoParseChapterOnOpen: boolean;
  readerDefaultFontSize: number;
  readerLineHeight: number;
  readerTheme: 'light' | 'sepia' | 'dark';
  autoPauseMode: 'off' | 'before' | 'after' | 'before-and-after' | 'rewind-and-pause';
  subtitleDualMode: boolean;
  targetSubtitleObscure: 'off' | 'blur' | 'hide';
  secondarySubtitleObscure: 'off' | 'blur' | 'hide';
  targetSubtitleSize: number;
  secondarySubtitleSize: number;
  subtitleOverlayOpacity: number;
  pauseOnWordInteraction: boolean;
  resumeAfterInteraction: boolean;
  resumeDelayMs: number;
  sceneSkipMode: 'off' | '2x' | '4x' | '6x' | '8x' | 'jump';
  removeBracketedSubtitles: boolean;
  aiModel: string;
  aiApiKey: string | null;
  forvoApiKey: string | null;
  ankiConnectUrl: string;
  ankiDeckName: string;
  apiBaseUrl: string;
  authToken: string | null;
}

export interface SubtitleCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  rawText: string;
  bookmarked: boolean;
  selected: boolean;
}

export interface SubtitleTrack {
  language: 'en' | 'tr';
  source: 'platform' | 'import';
  fileName?: string;
  cues: SubtitleCue[];
  timingOffsetMs: number;
}

export interface Token {
  lemma: string;
  surface: string;
  frequencyRank?: number;
  frequencyBand?: FrequencyBand;
  zipfScore?: number;
  status: WordStatus;
  node?: Text;
  startOffset?: number;
  endOffset?: number;
}
