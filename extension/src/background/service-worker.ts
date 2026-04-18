import { onMessage } from '../shared/messages';
import {
  getLexemes,
  setLexemeStatus,
  bulkSetLexemeStatus,
  getSettings,
  setSettings,
  saveFlashcard,
  getFlashcards,
  getAuthHeaders,
} from '../shared/storage';
import { callAI } from '../shared/ai';
import type { LexemeEntry } from '../shared/types';
import { populateDictionary, lookupTranslation } from './dictionary-db';

// Initialize the massive IndexedDB dictionary
populateDictionary().catch(console.error);

// Keep the MV3 service worker alive via a periodic no-op.
// The direct call covers every SW wakeup (module code re-runs each time).
// The onStartup listener was redundant — module-level keepAlive() already
// runs when the browser starts and wakes the SW, so it was creating a second
// concurrent interval on every browser startup.
setInterval(chrome.runtime.getPlatformInfo, 20e3);

const BACKEND_URL = 'https://syntagma.omerhanyigit.online';

async function refreshTokenIfNeeded(response: Response): Promise<void> {
  const newToken = response.headers.get('X-Refreshed-Token');
  if (newToken) {
    await setSettings({ authToken: newToken });
  }
}

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

      const s = await getSettings();
      if (s.authToken) {
        const apiBase = s.apiBaseUrl || BACKEND_URL;
        try {
          const res = await fetch(`${apiBase}/api/word-knowledge/${encodeURIComponent(lemma)}`, {
            method: 'PUT',
            headers: getAuthHeaders(s),
            body: JSON.stringify({ status: status.toUpperCase() }),
          });
          await refreshTokenIfNeeded(res);
        } catch (err) {
          console.warn('[Syntagma] Word knowledge sync error:', err);
        }
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

      const s2 = await getSettings();
      if (s2.authToken) {
        const apiBase2 = s2.apiBaseUrl || BACKEND_URL;
        try {
          const res = await fetch(`${apiBase2}/api/word-knowledge/batch`, {
            method: 'POST',
            headers: getAuthHeaders(s2),
            body: JSON.stringify({
              entries: lemmas.map((l: string) => ({ lemma: l, status: status.toUpperCase() })),
            }),
          });
          await refreshTokenIfNeeded(res);
        } catch (err) {
          console.warn('[Syntagma] Bulk word knowledge sync error:', err);
        }
      }

      // Send one BULK_STATUS_CHANGED per tab instead of O(tabs × lemmas) messages.
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'BULK_STATUS_CHANGED',
            payload: { lemmas, status },
          }).catch(() => {});
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
      const settings = await getSettings();
      if (!settings.authToken) {
        return { ok: false, error: 'Not logged in' };
      }
      const card = msg.payload;
      await saveFlashcard(card);
      if (settings.authToken) {
        const apiBase = settings.apiBaseUrl || BACKEND_URL;
        const payload = {
          lemma: card.lemma,
          translation: card.trMeaning || '',
          sourceSentence: card.sentence || '',
          exampleSentence: `${card.surfaceForm} — from ${card.sourceTitle || 'web'}`,
          knowledgeStatus: 'LEARNING',
        };
        try {
          const res = await fetch(`${apiBase}/api/flashcards`, {
            method: 'POST',
            headers: getAuthHeaders(settings),
            body: JSON.stringify(payload),
          });
          await refreshTokenIfNeeded(res);
        } catch (err) {
          console.error('[Syntagma] Backend sync error:', err);
        }
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

    case 'LOGIN': {
      const { email, password } = msg.payload;
      const s = await getSettings();
      const apiBase = s.apiBaseUrl || BACKEND_URL;
      let res: Response;
      try {
        res = await fetch(`${apiBase}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        return { ok: false, error: 'Cannot reach server' };
      }
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { return { ok: false, error: `Server error (${res.status})` }; }
      if (!res.ok) {
        return { ok: false, error: json?.message ?? `Login failed (${res.status})` };
      }
      const token: string = json.data?.token;
      const userEmail: string = json.data?.email ?? email;
      const userId: string = String(json.data?.userId ?? '');
      await setSettings({ authToken: token, authEmail: userEmail, authUserId: userId });
      return { ok: true, email: userEmail };
    }

    case 'REGISTER': {
      const { email, password } = msg.payload;
      const s = await getSettings();
      const apiBase = s.apiBaseUrl || BACKEND_URL;
      let res: Response;
      try {
        res = await fetch(`${apiBase}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        return { ok: false, error: 'Cannot reach server' };
      }
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { return { ok: false, error: `Server error (${res.status})` }; }
      if (!res.ok) {
        return { ok: false, error: json?.message ?? `Registration failed (${res.status})` };
      }
      // Auto-login after successful registration
      try {
        const loginRes = await fetch(`${apiBase}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (loginRes.ok) {
          const loginJson = await loginRes.json();
          const token: string = loginJson.data?.token;
          const userEmail: string = loginJson.data?.email ?? email;
          const userId: string = String(loginJson.data?.userId ?? '');
          await setSettings({ authToken: token, authEmail: userEmail, authUserId: userId });
          return { ok: true, email: userEmail };
        }
      } catch { /* ignore login error after successful register */ }
      return { ok: true, email };
    }

    case 'LOGOUT': {
      const logoutPatch = { authToken: null, authEmail: null, authUserId: null };
      await setSettings(logoutPatch);
      const logoutTabs = await chrome.tabs.query({});
      for (const tab of logoutTabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', payload: logoutPatch }).catch(() => {});
        }
      }
      return { ok: true };
    }

    case 'OPEN_AUTH_PAGE': {
      chrome.windows.create({
        url: chrome.runtime.getURL('auth.html'),
        type: 'popup',
        width: 400,
        height: 520,
        focused: true,
      });
      return { ok: true };
    }

    case 'CAPTURE_TAB_SCREENSHOT': {
      const tabId = sender.tab?.id;
      if (!tabId) return { error: 'No tab ID' };
      const dataUrl = await new Promise<string>((resolve, reject) => {
        chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 85 }, (url) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(url);
        });
      });
      return { dataUrl };
    }

    case 'GET_TAB_CAPTURE_STREAM_ID': {
      const tabId = sender.tab?.id;
      if (!tabId) return { error: 'No tab ID in sender' };
      const streamId = await new Promise<string>((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(id);
        });
      });
      return { streamId };
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
// Must be created inside onInstalled — not at module top level.
// MV3 service workers restart on every event wakeup; calling
// contextMenus.create at module scope causes "Cannot create item with
// duplicate id syntagma-lookup" errors on every restart after the first.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'syntagma-lookup',
    title: 'Look up in Syntagma',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'syntagma-lookup' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'LOOKUP_WORD',
      payload: { lemma: info.selectionText ?? '' },
    }).catch(() => {});
  }
});
