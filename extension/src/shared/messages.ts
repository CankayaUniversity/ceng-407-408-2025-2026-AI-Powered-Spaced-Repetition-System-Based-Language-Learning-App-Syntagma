import type { WordStatus, LearnerLevel, UserSettings, FlashcardPayload } from './types';

export type ExtensionMessage =
  | { type: 'PARSE_PAGE_FOR_COMPREHENSION'; payload: { tabId: number; pageUrl: string } }
  | { type: 'GET_COMPREHENSION_STATS'; payload: { pageUrl: string } }
  | { type: 'TOGGLE_INLINE_TRANSLATIONS'; payload: { enabled: boolean } }
  | { type: 'TOGGLE_STATUS_COLORS'; payload: { enabled: boolean } }
  | { type: 'SET_WORD_STATUS'; payload: { lemma: string; status: WordStatus } }
  | { type: 'BULK_SET_WORD_STATUS'; payload: { lemmas: string[]; status: WordStatus } }
  | { type: 'LOOKUP_WORD'; payload: { lemma: string; sentence?: string } }
  | { type: 'LOOKUP_WORD_FREQUENCY'; payload: { lemma: string } }
  | { type: 'EXPLAIN_WORD_WITH_AI'; payload: { word: string; sentence: string; context?: string; level: LearnerLevel; requestId: string } }
  | { type: 'EXPLAIN_SENTENCE_WITH_AI'; payload: { sentence: string; level: LearnerLevel; requestId: string } }
  | { type: 'TRANSLATE_SENTENCE_WITH_AI'; payload: { sentence: string; requestId: string } }
  | { type: 'FETCH_WORD_AUDIO'; payload: { word: string; accent: 'uk' | 'us' } }
  | { type: 'OPEN_EXTERNAL_DICTIONARY'; payload: { provider: 'tureng' | 'cambridge' | 'oxford' | 'merriam-webster'; word: string } }
  | { type: 'CREATE_FLASHCARD'; payload: FlashcardPayload }
  | { type: 'EXPORT_TO_ANKI'; payload: { cardIds: string[] } }
  | { type: 'GET_SETTINGS'; payload: null }
  | { type: 'SET_SETTINGS'; payload: Partial<UserSettings> };

export type BackgroundMessage =
  | { type: 'AI_STREAM_CHUNK'; payload: { requestId: string; chunk: string } }
  | { type: 'AI_STREAM_DONE'; payload: { requestId: string } }
  | { type: 'AI_STREAM_ERROR'; payload: { requestId: string; error: string } }
  | { type: 'STATUS_CHANGED'; payload: { lemma: string; status: WordStatus } }
  | { type: 'SETTINGS_UPDATED'; payload: Partial<UserSettings> };

export function sendMessage<T>(msg: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(msg);
}

export function onMessage(
  handler: (msg: ExtensionMessage, sender: chrome.runtime.MessageSender) => unknown
): void {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const result = handler(msg as ExtensionMessage, sender);
    if (result instanceof Promise) {
      result.then(sendResponse);
      return true;
    }
    if (result !== undefined) {
      sendResponse(result);
    }
  });
}
