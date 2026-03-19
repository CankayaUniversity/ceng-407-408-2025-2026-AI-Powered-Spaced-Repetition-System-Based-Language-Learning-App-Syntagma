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

    case 'CREATE_FLASHCARD': {
      const card = msg.payload;
      // Save locally first
      await saveFlashcard(card);

      // Sync to Spring Boot backend if configured
      const settings = await getSettings();
      if (settings.apiBaseUrl) {
        try {
          const res = await fetch(`${settings.apiBaseUrl}/api/flashcards`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(settings.authToken ? { 'Authorization': `Bearer ${settings.authToken}` } : {}),
            },
            body: JSON.stringify({
              id: card.id,
              lemma: card.lemma,
              surfaceForm: card.surfaceForm,
              sentence: card.sentence,
              sourceUrl: card.sourceUrl,
              sourceTitle: card.sourceTitle,
              trMeaning: card.trMeaning,
              audioUrl: card.audioUrl ?? null,
              deckName: card.deckName,
              tags: card.tags,
              createdAt: card.createdAt,
            }),
          });
          if (!res.ok) {
            console.warn('[Syntagma] Backend sync failed:', res.status, res.statusText);
          }
        } catch (err) {
          // Don't fail the save if backend is unreachable — it's saved locally
          console.warn('[Syntagma] Backend sync error (card saved locally):', err);
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
