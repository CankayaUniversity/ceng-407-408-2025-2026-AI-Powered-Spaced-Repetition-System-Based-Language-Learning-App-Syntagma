import type { WordStatus, LearnerLevel, UserSettings, FlashcardPayload } from './types';
import type { AiResultData } from './backend-ai';

export type CardCreatorPanel = 'home' | 'flashcards' | 'dictionary';

export type OpenCardCreatorPayload =
  | { mode?: 'create'; panel?: CardCreatorPanel; word: string; sentence: string; sourceUrl: string; sourceTitle: string; trMeaning?: string }
  | { mode: 'edit'; card: FlashcardPayload };

export type FlashcardMediaOp = 'keep' | 'replace' | 'remove';

export type ExtensionMessage =
  | { type: 'PARSE_PAGE_FOR_COMPREHENSION'; payload: { tabId: number; pageUrl: string } }
  | { type: 'GET_COMPREHENSION_STATS'; payload: { pageUrl: string } }
  | { type: 'TOGGLE_INLINE_TRANSLATIONS'; payload: { enabled: boolean } }
  | { type: 'TOGGLE_STATUS_COLORS'; payload: { enabled: boolean } }
  | { type: 'SET_WORD_STATUS'; payload: { lemma: string; status: WordStatus } }
  | { type: 'BULK_SET_WORD_STATUS'; payload: { lemmas: string[]; status: WordStatus } }
  | { type: 'UPSERT_WORD_KNOWLEDGE'; payload: { lemma: string; status: WordStatus } }
  | { type: 'DELETE_WORD_KNOWLEDGE'; payload: { lemma: string } }
  | { type: 'LOOKUP_WORD'; payload: { lemma: string; sentence?: string } }
  | { type: 'LOOKUP_WORD_FREQUENCY'; payload: { lemma: string } }
  | { type: 'EXPLAIN_WORD_WITH_AI'; payload: { word: string; sentence: string; context?: string; level: LearnerLevel; requestId: string } }
  | { type: 'EXPLAIN_SENTENCE_WITH_AI'; payload: { sentence: string; level: LearnerLevel; requestId: string } }
  | { type: 'TRANSLATE_SENTENCE_WITH_AI'; payload: { sentence: string; requestId: string } }
  | { type: 'FETCH_WORD_AUDIO'; payload: { word: string; accent: 'uk' | 'us' } }
  | { type: 'OPEN_EXTERNAL_DICTIONARY'; payload: { provider: 'tureng' | 'cambridge' | 'oxford' | 'merriam-webster'; word: string } }
  | { type: 'LOOKUP_DICTIONARY'; payload: { word: string } }
  | { type: 'CREATE_FLASHCARD'; payload: FlashcardPayload }
  | {
    type: 'UPDATE_FLASHCARD';
    payload: {
      id: string;
      card: FlashcardPayload;
      selectedCollectionId: number | null;
      mediaOps?: {
        screenshot?: FlashcardMediaOp;
        audio?: FlashcardMediaOp;
      };
    };
  }
  | { type: 'FETCH_FLASHCARDS'; payload: null }
  | { type: 'DELETE_FLASHCARD'; payload: { id: string } }
  | { type: 'FETCH_COLLECTIONS'; payload: null }
  | { type: 'CREATE_COLLECTION'; payload: { name: string } }
  | { type: 'DELETE_COLLECTION'; payload: { id: number } }
  | { type: 'EXPORT_TO_ANKI'; payload: { cardIds: string[] } }
  | { type: 'GET_SETTINGS'; payload: null }
  | { type: 'SET_SETTINGS'; payload: Partial<UserSettings> }
  | { type: 'OPEN_OPTIONS_PAGE'; payload: null }
  | { type: 'OPEN_CARD_CREATOR'; payload: OpenCardCreatorPayload }
  | { type: 'LOGIN'; payload: { email: string; password: string } }
  | { type: 'REGISTER'; payload: { email: string; password: string; learnerLevel: LearnerLevel } }
  | { type: 'LOGOUT'; payload: null }
  | { type: 'OPEN_AUTH_PAGE'; payload: null }
  | { type: 'OPEN_READER'; payload: null }
  | { type: 'GET_TAB_CAPTURE_STREAM_ID'; payload: null }
  | { type: 'CAPTURE_TAB_SCREENSHOT'; payload: null }
  | { type: 'UPLOAD_SENTENCE_AUDIO'; payload: { flashcardId: number; audioDataUrl: string; mimeType: string; sentence: string; videoUrl: string } };

export type BackgroundMessage =
  | { type: 'AI_STREAM_CHUNK'; payload: { requestId: string; chunk: string } }
  | { type: 'AI_STREAM_DONE'; payload: { requestId: string } }
  | { type: 'AI_STREAM_ERROR'; payload: { requestId: string; error: string } }
  | { type: 'AI_RESULT'; payload: { requestId: string; result: AiResultData } }
  | { type: 'STATUS_CHANGED'; payload: { lemma: string; status: WordStatus } }
  | { type: 'BULK_STATUS_CHANGED'; payload: { lemmas: string[]; status: WordStatus } }
  | { type: 'WORD_KNOWLEDGE_DELETED'; payload: { lemma: string } }
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
      // MUST handle rejection: without .catch, sendResponse is never called
      // when the handler throws, causing Chrome to log "The message channel
      // closed before a response was received" for every async handler.
      result
        .then(sendResponse)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ error: message });
        });
      return true; // keep channel open for async response
    }
    if (result !== undefined) {
      sendResponse(result);
    }
  });
}
