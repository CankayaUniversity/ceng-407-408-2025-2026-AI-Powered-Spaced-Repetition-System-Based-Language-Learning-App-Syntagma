import { onMessage } from '../shared/messages';
import {
  getLexemes,
  setLexemeStatus,
  bulkSetLexemeStatus,
  getSettings,
  setSettings,
  saveFlashcard,
  getFlashcards,
} from '../shared/storage';
import { callAI } from '../shared/ai';
import type { LexemeEntry } from '../shared/types';
import { populateDictionary, lookupTranslation } from './dictionary-db';

// Initialize the massive IndexedDB dictionary
populateDictionary().catch(console.error);

// Keep alive for MV3 service workers
const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20e3);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();

function _computeComprehension(entries: LexemeEntry[], totalTokenCount: number): number {
  const known = entries.filter(e => e.status === 'known').length;
  const learning = entries.filter(e => e.status === 'learning').length;
  return Math.round(((known + 0.5 * learning) / Math.max(totalTokenCount, 1)) * 100);
}

onMessage(async (msg, sender) => {
  // Security: only accept messages from our own extension
  if (sender.id && sender.id !== chrome.runtime.id) return;

  switch (msg.type) {
    case 'GET_SETTINGS': {
      return await getSettings();
    }

    case 'SET_SETTINGS': {
      await setSettings(msg.payload);
      // Broadcast to all content scripts
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            payload: msg.payload,
          }).catch(() => {}); // Ignore tabs without content script
        }
      }
      return { ok: true };
    }

    case 'SET_WORD_STATUS': {
      const { lemma, status } = msg.payload;
      await setLexemeStatus(lemma, status);

      // Sync to backend
      const BACKEND_URL = 'https://syntagma.omerhanyigit.online';
      const DEFAULT_USER_ID = '3';
      const s = await getSettings();
      const apiBase = s.apiBaseUrl || BACKEND_URL;
      const uid = s.authToken || DEFAULT_USER_ID;
      try {
        await fetch(`${apiBase}/api/word-knowledge/${encodeURIComponent(lemma)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': uid },
          body: JSON.stringify({ status: status.toUpperCase() }),
        });
      } catch (err) {
        console.warn('[Syntagma] Word knowledge sync error:', err);
      }

      // Broadcast status change to all tabs
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'STATUS_CHANGED',
            payload: { lemma, status },
          }).catch(() => {});
        }
      }
      return { ok: true };
    }

    case 'BULK_SET_WORD_STATUS': {
      const { lemmas, status } = msg.payload;
      await bulkSetLexemeStatus(lemmas, status);

      // Sync to backend
      const BACKEND_URL2 = 'https://syntagma.omerhanyigit.online';
      const DEFAULT_UID2 = '3';
      const s2 = await getSettings();
      const apiBase2 = s2.apiBaseUrl || BACKEND_URL2;
      const uid2 = s2.authToken || DEFAULT_UID2;
      try {
        await fetch(`${apiBase2}/api/word-knowledge/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': uid2 },
          body: JSON.stringify({
            entries: lemmas.map((l: string) => ({ lemma: l, status: status.toUpperCase() })),
          }),
        });
      } catch (err) {
        console.warn('[Syntagma] Bulk word knowledge sync error:', err);
      }

      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          for (const lemma of lemmas) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'STATUS_CHANGED',
              payload: { lemma, status },
            }).catch(() => {});
          }
        }
      }
      return { ok: true };
    }

    case 'PARSE_PAGE_FOR_COMPREHENSION': {
      const lexemes = await getLexemes();
      // The content script sends the token count and known lemmas via a follow-up
      // For now, return the lexemes so content script can compute stats
      return { lexemes };
    }

    case 'EXPLAIN_WORD_WITH_AI': {
      const { word, sentence, context, level, requestId } = msg.payload;
      const tabId = sender.tab?.id;
      if (!tabId) return;

      try {
        const stream = await callAI({
          type: 'explain-word',
          payload: { word, sentence, context: context ?? '', level },
          stream: true,
          requestId,
        });

        if (typeof stream === 'string') {
          chrome.tabs.sendMessage(tabId, {
            type: 'AI_STREAM_CHUNK',
            payload: { requestId, chunk: stream },
          }).catch(() => {});
          chrome.tabs.sendMessage(tabId, {
            type: 'AI_STREAM_DONE',
            payload: { requestId },
          }).catch(() => {});
        } else {
          const reader = (stream as ReadableStream<string>).getReader();
          const pump = async (): Promise<void> => {
            const { done, value } = await reader.read();
            if (done) {
              chrome.tabs.sendMessage(tabId, {
                type: 'AI_STREAM_DONE',
                payload: { requestId },
              }).catch(() => {});
              return;
            }
            chrome.tabs.sendMessage(tabId, {
              type: 'AI_STREAM_CHUNK',
              payload: { requestId, chunk: value },
            }).catch(() => {});
            await pump();
          };
          await pump();
        }
      } catch (error) {
        chrome.tabs.sendMessage(tabId, {
          type: 'AI_STREAM_ERROR',
          payload: { requestId, error: (error as Error).message },
        }).catch(() => {});
      }
      return { ok: true };
    }

    case 'EXPLAIN_SENTENCE_WITH_AI': {
      const { sentence, level, requestId } = msg.payload;
      const tabId = sender.tab?.id;
      if (!tabId) return;

      try {
        const stream = await callAI({
          type: 'explain-sentence',
          payload: { sentence, level },
          stream: true,
          requestId,
        });

        if (typeof stream === 'string') {
          chrome.tabs.sendMessage(tabId, { type: 'AI_STREAM_CHUNK', payload: { requestId, chunk: stream } }).catch(() => {});
          chrome.tabs.sendMessage(tabId, { type: 'AI_STREAM_DONE', payload: { requestId } }).catch(() => {});
        } else {
          const reader = (stream as ReadableStream<string>).getReader();
          const pump = async (): Promise<void> => {
            const { done, value } = await reader.read();
            if (done) {
              chrome.tabs.sendMessage(tabId, { type: 'AI_STREAM_DONE', payload: { requestId } }).catch(() => {});
              return;
            }
            chrome.tabs.sendMessage(tabId, { type: 'AI_STREAM_CHUNK', payload: { requestId, chunk: value } }).catch(() => {});
            await pump();
          };
          await pump();
        }
      } catch (error) {
        chrome.tabs.sendMessage(tabId, { type: 'AI_STREAM_ERROR', payload: { requestId, error: (error as Error).message } }).catch(() => {});
      }
      return { ok: true };
    }

    case 'TRANSLATE_SENTENCE_WITH_AI': {
      const { sentence, requestId } = msg.payload;
      const tabId = sender.tab?.id;
      if (!tabId) return;

      try {
        const result = await callAI({
          type: 'translate-sentence',
          payload: { sentence },
          stream: false,
          requestId,
        });
        chrome.tabs.sendMessage(tabId, { type: 'AI_STREAM_CHUNK', payload: { requestId, chunk: result as string } }).catch(() => {});
        chrome.tabs.sendMessage(tabId, { type: 'AI_STREAM_DONE', payload: { requestId } }).catch(() => {});
      } catch (error) {
        chrome.tabs.sendMessage(tabId, { type: 'AI_STREAM_ERROR', payload: { requestId, error: (error as Error).message } }).catch(() => {});
      }
      return { ok: true };
    }

    case 'FETCH_WORD_AUDIO': {
      const { word } = msg.payload;
      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        const data = await res.json() as Array<{ phonetics: Array<{ audio: string; text?: string }> }>;
        const audioUrl = data[0]?.phonetics?.find(p => p.audio)?.audio ?? null;
        return { audioUrl };
      } catch {
        return { audioUrl: null };
      }
    }

    case 'LOOKUP_DICTIONARY': {
      const { word } = msg.payload;
      try {
        const translations = await lookupTranslation(word);
        return { translations };
      } catch (err) {
        console.error('[Syntagma] LOOKUP_DICTIONARY error:', err);
        return { translations: [] };
      }
    }

    case 'CREATE_FLASHCARD': {
      const card = msg.payload;
      console.log('[Syntagma] CREATE_FLASHCARD received:', card.lemma);
      // Save locally first
      await saveFlashcard(card);
      console.log('[Syntagma] Saved locally.');

      // Sync to Spring Boot backend
      const BACKEND_URL = 'https://syntagma.omerhanyigit.online';
      const DEFAULT_USER_ID = '3'; // Default test user

      const settings = await getSettings();
      const apiBase = settings.apiBaseUrl || BACKEND_URL;
      const userId = settings.authToken || DEFAULT_USER_ID; // authToken stores the userId for now

      const payload = {
        lemma: card.lemma,
        translation: card.trMeaning || '',
        sourceSentence: card.sentence || '',
        exampleSentence: `${card.surfaceForm} — from ${card.sourceTitle || 'web'}`,
        knowledgeStatus: 'LEARNING',
      };
      console.log('[Syntagma] Syncing to:', apiBase, 'userId:', userId, 'payload:', JSON.stringify(payload));

      try {
        const res = await fetch(`${apiBase}/api/flashcards`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
          },
          body: JSON.stringify(payload),
        });
        const responseText = await res.text();
        console.log('[Syntagma] Backend response:', res.status, responseText);
      } catch (err) {
        console.error('[Syntagma] Backend sync error:', err);
      }

      return { ok: true };
    }

    case 'EXPORT_TO_ANKI': {
      const { cardIds } = msg.payload;
      const allCards = await getFlashcards();
      const cards = allCards.filter(c => cardIds.includes(c.id));
      const settings = await getSettings();

      const notes = cards.map(card => ({
        deckName: card.deckName || settings.ankiDeckName,
        modelName: 'Basic',
        fields: {
          Front: `<b>${card.lemma}</b><br><i>${card.sentence}</i>`,
          Back: card.trMeaning || '',
        },
        tags: card.tags,
      }));

      try {
        const res = await fetch(settings.ankiConnectUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addNotes', version: 6, params: { notes } }),
        });
        const result = await res.json();
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }

    case 'OPEN_OPTIONS_PAGE': {
      chrome.windows.create({
        url: chrome.runtime.getURL('options.html'),
        type: 'popup',
        width: 820,
        height: 680,
        focused: true,
      });
      return { ok: true };
    }

    case 'OPEN_CARD_CREATOR': {
      const { word, sentence, sourceUrl, sourceTitle } = msg.payload;
      const params = new URLSearchParams({ word, sentence, sourceUrl, sourceTitle });
      chrome.windows.create({
        url: chrome.runtime.getURL(`card-creator.html?${params}`),
        type: 'popup',
        width: 900,
        height: 640,
        focused: true,
      });
      return { ok: true };
    }

    default:
      return;
  }
});

// Context menu for "Look up in Syntagma"
chrome.contextMenus.create({
  id: 'syntagma-lookup',
  title: 'Look up in Syntagma',
  contexts: ['selection'],
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'syntagma-lookup' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'LOOKUP_WORD',
      payload: { lemma: info.selectionText ?? '' },
    }).catch(() => {});
  }
});
