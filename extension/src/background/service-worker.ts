import { onMessage } from '../shared/messages';
import {
  getLexemes,
  setLexemeStatus,
  bulkSetLexemeStatus,
  deleteLexeme,
  getSettings,
  setSettings,
  getFlashcards,
  getAuthHeaders,
  userScopedKey,
} from '../shared/storage';
import {
  explainWord as backendExplainWord,
  translateSentence as backendTranslate,
  explainSentence as backendExplainSentence,
} from '../shared/backend-ai';
import type { FlashcardPayload, LexemeEntry } from '../shared/types';
import {
  buildBackendFlashcardPayload,
  mapBackendFlashcard,
  mergeFlashcardWithLocalFields,
} from '../shared/flashcards';
import { populateDictionary, lookupTranslation } from './dictionary-db';
import { applyKnownWordsForLevel } from '../shared/cefr-intake';

// Initialize the massive IndexedDB dictionary
populateDictionary().catch(console.error);

// Keep the MV3 service worker alive via a periodic no-op.
// The direct call covers every SW wakeup (module code re-runs each time).
// The onStartup listener was redundant 窶・module-level keepAlive() already
// runs when the browser starts and wakes the SW, so it was creating a second
// concurrent interval on every browser startup.
setInterval(chrome.runtime.getPlatformInfo, 20e3);

const BACKEND_URL = 'https://syntagma.omerhanyigit.online';
const MEDIA_URL_CACHE_KEY = 'flashcardMediaUrls';
const SCREENSHOT_URL_CACHE_KEY = 'flashcardScreenshotUrls';
const MEDIA_URL_REFRESH_MARGIN_MS = 30_000;
const CARD_CREATOR_DRAFT_PREFIX = 'cardCreatorDraft:';
const CARD_CREATOR_DEFAULT_DIMENSIONS = {
  width: 1100,
  height: 760,
};

chrome.action.onClicked.addListener(async () => {
  const params = new URLSearchParams({
    mode: 'create',
    panel: 'home',
    word: '',
    sentence: '',
    sourceUrl: '',
    sourceTitle: '',
  });
  await openCardCreatorWindow(params);
});

interface CachedMediaUrls {
  screenshotUrl?: string;
  audioUrl?: string;
  expiresAt: number;
}
type MediaUrlCache = Record<string, CachedMediaUrls>;
// Keep the old type alias so the screenshot-only cache key still works during migration.
type ScreenshotUrlCache = Record<string, { url: string; expiresAt: number }>;

interface MediaAssetRecord {
  mediaId: number;
  type: string;
  createdAt?: string;
}

async function refreshTokenIfNeeded(response: Response): Promise<void> {
  const newToken = response.headers.get('X-Refreshed-Token');
  if (!newToken) return;

  const settings = await getSettings();
  if (settings.authToken !== newToken) {
    await setSettings({ authToken: newToken });
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }));

  return results;
}

function _computeComprehension(entries: LexemeEntry[], totalTokenCount: number): number {
  const known = entries.filter(e => e.status === 'known').length;
  const learning = entries.filter(e => e.status === 'learning').length;
  return Math.round(((known + 0.5 * learning) / Math.max(totalTokenCount, 1)) * 100);
}

function withDeckName(card: FlashcardPayload): FlashcardPayload {
  const fallbackId = card.collectionId ?? card.collectionIds?.[0];
  const fallbackDeckName = fallbackId != null ? `Collection #${fallbackId}` : 'Syntagma';
  return { ...card, deckName: card.deckName || fallbackDeckName };
}

async function upsertFlashcardInLocalCache(settings: Awaited<ReturnType<typeof getSettings>>, card: FlashcardPayload): Promise<void> {
  const fcKey = userScopedKey('flashcards', settings.authUserId);
  const existing = await chrome.storage.local.get(fcKey);
  const cards = (existing[fcKey] ?? []) as FlashcardPayload[];
  const index = cards.findIndex(item => item.id === card.id);
  if (index >= 0) {
    cards[index] = card;
  } else {
    cards.push(card);
  }
  await chrome.storage.local.set({ [fcKey]: cards });
}

async function removeFlashcardFromLocalCache(settings: Awaited<ReturnType<typeof getSettings>>, flashcardId: string): Promise<void> {
  const fcKey = userScopedKey('flashcards', settings.authUserId);
  const existing = await chrome.storage.local.get(fcKey);
  const cards = (existing[fcKey] ?? []) as FlashcardPayload[];
  await chrome.storage.local.set({
    [fcKey]: cards.filter(card => card.id !== flashcardId),
  });
}

let cardCreatorWindowId: number | null = null;

async function findExistingCardCreatorWindow(): Promise<number | null> {
  try {
    const allWindows = await chrome.windows.getAll({ windowTypes: ['popup'] });
    for (const w of allWindows) {
      if (!w.id) continue;
      const tabs = await chrome.tabs.query({ windowId: w.id });
      if (tabs.some(t => t.url?.includes('card-creator.html'))) return w.id;
    }
  } catch {}
  return null;
}

async function openCardCreatorWindow(params: URLSearchParams): Promise<void> {
  const targetUrl = chrome.runtime.getURL(`card-creator.html?${params.toString()}`);

  // Try the cached window ID first
  if (cardCreatorWindowId != null) {
    try {
      const existing = await chrome.windows.get(cardCreatorWindowId);
      if (existing) {
        await chrome.windows.update(cardCreatorWindowId, { focused: true });
        const tabs = await chrome.tabs.query({ windowId: cardCreatorWindowId });
        if (tabs.length > 0 && tabs[0].id) {
          await chrome.tabs.update(tabs[0].id, { url: targetUrl });
        }
        return;
      }
    } catch {
      cardCreatorWindowId = null;
    }
  }

  // Scan for orphaned card-creator windows (SW restart loses the variable)
  const orphan = await findExistingCardCreatorWindow();
  if (orphan != null) {
    cardCreatorWindowId = orphan;
    await chrome.windows.update(orphan, { focused: true });
    const tabs = await chrome.tabs.query({ windowId: orphan });
    if (tabs.length > 0 && tabs[0].id) {
      await chrome.tabs.update(tabs[0].id, { url: targetUrl });
    }
    return;
  }

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(`card-creator.html?${params.toString()}`),
    type: 'popup',
    width: CARD_CREATOR_DEFAULT_DIMENSIONS.width,
    height: CARD_CREATOR_DEFAULT_DIMENSIONS.height,
    focused: true,
  });
  cardCreatorWindowId = win?.id ?? null;
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === cardCreatorWindowId) cardCreatorWindowId = null;
});

async function getResponseError(response: Response, fallback: string): Promise<string> {
  try {
    const json = await response.clone().json();
    return json?.message ?? fallback;
  } catch {
    return fallback;
  }
}

function getImageFileName(card: FlashcardPayload, contentType: string): string {
  const safeLemma = (card.lemma || 'screenshot').replace(/[^A-Za-z0-9._-]/g, '_');
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  return `${safeLemma}-${Date.now()}.${extension}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(',');
  if (!meta || !data) throw new Error('Invalid screenshot data URL');

  const contentType = meta.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

async function uploadScreenshotMedia(
  apiBase: string,
  settings: Awaited<ReturnType<typeof getSettings>>,
  flashcardId: number,
  card: FlashcardPayload
): Promise<string | undefined> {
  if (!card.screenshotDataUrl) return undefined;

  const blob = dataUrlToBlob(card.screenshotDataUrl);
  const contentType = blob.type || 'image/jpeg';
  const fileName = getImageFileName(card, contentType);

  const presignResponse = await fetch(`${apiBase}/api/media/presign`, {
    method: 'POST',
    headers: getAuthHeaders(settings),
    body: JSON.stringify({
      flashcardId,
      type: 'SCREENSHOT',
      fileName,
      contentType,
      size: blob.size,
    }),
  });
  await refreshTokenIfNeeded(presignResponse);
  if (!presignResponse.ok) {
    throw new Error(await getResponseError(presignResponse, `Screenshot presign failed (${presignResponse.status})`));
  }

  const presignJson = await presignResponse.json();
  const { uploadUrl, objectKey } = presignJson.data ?? {};
  if (!uploadUrl || !objectKey) throw new Error('Screenshot presign response was incomplete');

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Screenshot upload failed (${uploadResponse.status})`);
  }

  const mediaResponse = await fetch(`${apiBase}/api/media`, {
    method: 'POST',
    headers: getAuthHeaders(settings),
    body: JSON.stringify({
      flashcardId,
      type: 'SCREENSHOT',
      objectKey,
      originalFileName: fileName,
      contentType,
      size: blob.size,
    }),
  });
  await refreshTokenIfNeeded(mediaResponse);
  if (!mediaResponse.ok) {
    throw new Error(await getResponseError(mediaResponse, `Screenshot media save failed (${mediaResponse.status})`));
  }

  const mediaJson = await mediaResponse.json();
  const mediaId = mediaJson.data?.mediaId;
  if (!mediaId) return undefined;

  const urlResponse = await fetch(`${apiBase}/api/media/${mediaId}/url`, {
    headers: getAuthHeaders(settings),
  });
  await refreshTokenIfNeeded(urlResponse);
  if (!urlResponse.ok) return undefined;
  const urlJson = await urlResponse.json();
  return urlJson.data?.downloadUrl;
}

async function uploadAudioMedia(
  apiBase: string,
  settings: Awaited<ReturnType<typeof getSettings>>,
  flashcardId: number,
  card: FlashcardPayload
): Promise<string | undefined> {
  if (!card.sentenceAudioDataUrl) return undefined;

  const blob = dataUrlToBlob(card.sentenceAudioDataUrl);
  const contentType = blob.type || 'audio/webm';
  const ext = contentType.includes('webm') ? 'webm' : 'ogg';
  const fileName = `sentence_audio_${flashcardId}_${Date.now()}.${ext}`;

  const presignResponse = await fetch(`${apiBase}/api/media/presign`, {
    method: 'POST',
    headers: getAuthHeaders(settings),
    body: JSON.stringify({
      flashcardId,
      type: 'AUDIO',
      fileName,
      contentType,
      size: blob.size,
    }),
  });
  await refreshTokenIfNeeded(presignResponse);
  if (!presignResponse.ok) {
    console.warn('[Syntagma] Audio presign failed:', presignResponse.status);
    return undefined;
  }

  const presignJson = await presignResponse.json();
  const { uploadUrl, objectKey } = presignJson.data ?? {};
  if (!uploadUrl || !objectKey) return undefined;

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!uploadResponse.ok) {
    console.warn('[Syntagma] Audio S3 upload failed:', uploadResponse.status);
    return undefined;
  }

  const mediaResponse = await fetch(`${apiBase}/api/media`, {
    method: 'POST',
    headers: getAuthHeaders(settings),
    body: JSON.stringify({
      flashcardId,
      type: 'AUDIO',
      objectKey,
      originalFileName: fileName,
      contentType,
      size: blob.size,
    }),
  });
  await refreshTokenIfNeeded(mediaResponse);
  if (!mediaResponse.ok) return undefined;

  const mediaJson = await mediaResponse.json();
  const mediaId = mediaJson.data?.mediaId;
  if (!mediaId) return undefined;

  const urlResponse = await fetch(`${apiBase}/api/media/${mediaId}/url`, {
    headers: getAuthHeaders(settings),
  });
  await refreshTokenIfNeeded(urlResponse);
  if (!urlResponse.ok) return undefined;
  const urlJson = await urlResponse.json();
  return urlJson.data?.downloadUrl;
}

function pickLatestMediaAsset(assets: MediaAssetRecord[], type: 'SCREENSHOT' | 'AUDIO'): MediaAssetRecord | undefined {
  const candidates = assets.filter(asset => asset.type === type);
  if (candidates.length === 0) return undefined;

  return candidates.sort((a, b) => {
    const aTime = Date.parse(a.createdAt ?? '');
    const bTime = Date.parse(b.createdAt ?? '');
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
    return b.mediaId - a.mediaId;
  })[0];
}

async function fetchFlashcardMediaAssets(
  apiBase: string,
  settings: Awaited<ReturnType<typeof getSettings>>,
  flashcardId: string
): Promise<MediaAssetRecord[]> {
  const mediaResponse = await fetch(`${apiBase}/api/flashcards/${encodeURIComponent(flashcardId)}/media`, {
    headers: getAuthHeaders(settings),
  });
  await refreshTokenIfNeeded(mediaResponse);
  if (!mediaResponse.ok) {
    throw new Error(await getResponseError(mediaResponse, `Media list failed (${mediaResponse.status})`));
  }

  const mediaJson = await mediaResponse.json();
  const assets = Array.isArray(mediaJson?.data) ? mediaJson.data : [];
  return assets
    .map((asset: unknown) => {
      const record = asset as Record<string, unknown>;
      return {
        mediaId: Number(record.mediaId),
        type: String(record.type ?? ''),
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined,
      };
    })
    .filter((asset: MediaAssetRecord) => Number.isFinite(asset.mediaId));
}

async function deleteMediaAssetById(
  apiBase: string,
  settings: Awaited<ReturnType<typeof getSettings>>,
  mediaId: number
): Promise<void> {
  const response = await fetch(`${apiBase}/api/media/${mediaId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(settings),
  });
  await refreshTokenIfNeeded(response);
  if (!response.ok) {
    throw new Error(await getResponseError(response, `Media delete failed (${response.status})`));
  }
}

async function getMediaUrls(
  apiBase: string,
  settings: Awaited<ReturnType<typeof getSettings>>,
  flashcardId: string,
  cache: MediaUrlCache
): Promise<{ screenshotUrl?: string; audioUrl?: string }> {
  const cached = cache[flashcardId];
  if (cached && cached.expiresAt > Date.now()) {
    return { screenshotUrl: cached.screenshotUrl, audioUrl: cached.audioUrl };
  }

  let assets: MediaAssetRecord[] = [];
  try {
    assets = await fetchFlashcardMediaAssets(apiBase, settings, flashcardId);
  } catch {
    return {};
  }

  const result: { screenshotUrl?: string; audioUrl?: string } = {};
  let minExpiresAt = Infinity;

  // Resolve download URLs for both SCREENSHOT and AUDIO assets in parallel
  const screenshot = pickLatestMediaAsset(assets, 'SCREENSHOT');
  const audio = pickLatestMediaAsset(assets, 'AUDIO');

  const resolveUrl = async (mediaId: number | undefined): Promise<{ url?: string; expiresAt?: number }> => {
    if (!mediaId) return {};
    const urlResponse = await fetch(`${apiBase}/api/media/${mediaId}/url`, {
      headers: getAuthHeaders(settings),
    });
    await refreshTokenIfNeeded(urlResponse);
    if (!urlResponse.ok) return {};
    const urlJson = await urlResponse.json();
    const expiresAt = Date.parse(urlJson.data?.expiresAt ?? '');
    return { url: urlJson.data?.downloadUrl, expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined };
  };

  const [ssResult, audioResult] = await Promise.all([
    resolveUrl(screenshot?.mediaId),
    resolveUrl(audio?.mediaId),
  ]);

  if (ssResult.url) {
    result.screenshotUrl = ssResult.url;
    if (ssResult.expiresAt && ssResult.expiresAt < minExpiresAt) minExpiresAt = ssResult.expiresAt;
  }
  if (audioResult.url) {
    result.audioUrl = audioResult.url;
    if (audioResult.expiresAt && audioResult.expiresAt < minExpiresAt) minExpiresAt = audioResult.expiresAt;
  }

  cache[flashcardId] = {
    screenshotUrl: result.screenshotUrl,
    audioUrl: result.audioUrl,
    expiresAt: Number.isFinite(minExpiresAt)
      ? minExpiresAt - MEDIA_URL_REFRESH_MARGIN_MS
      : Date.now() + 8 * 60 * 1000,
  };
  return result;
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
      // When learner level changes, mark CEFR words as known
      if (msg.payload.learnerLevel) {
        try {
          await applyKnownWordsForLevel(msg.payload.learnerLevel);
        } catch (err) {
          console.warn('[Syntagma] CEFR intake error:', err);
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
          if (status === 'unknown') {
            chrome.tabs.sendMessage(tab.id, {
              type: 'WORD_KNOWLEDGE_DELETED',
              payload: { lemma },
            }).catch(() => {});
          } else {
            chrome.tabs.sendMessage(tab.id, {
              type: 'STATUS_CHANGED',
              payload: { lemma, status },
            }).catch(() => {});
          }
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

      // Send one BULK_STATUS_CHANGED per tab instead of O(tabs ﾃ・lemmas) messages.
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          if (status === 'unknown') {
            for (const lemma of lemmas) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'WORD_KNOWLEDGE_DELETED',
                payload: { lemma },
              }).catch(() => {});
            }
          } else {
            chrome.tabs.sendMessage(tab.id, {
              type: 'BULK_STATUS_CHANGED',
              payload: { lemmas, status },
            }).catch(() => {});
          }
        }
      }
      return { ok: true };
    }

    case 'UPSERT_WORD_KNOWLEDGE': {
      const normalizedLemma = msg.payload.lemma.trim().toLowerCase();
      const { status } = msg.payload;
      if (!normalizedLemma) return { ok: false, error: 'Lemma is required' };

      if (status === 'unknown') {
        await deleteLexeme(normalizedLemma);
      } else {
        await setLexemeStatus(normalizedLemma, status);
      }

      const s = await getSettings();
      if (s.authToken) {
        const apiBase = s.apiBaseUrl || BACKEND_URL;
        try {
          const method = status === 'unknown' ? 'DELETE' : 'PUT';
          const res = await fetch(`${apiBase}/api/word-knowledge/${encodeURIComponent(normalizedLemma)}`, {
            method,
            headers: getAuthHeaders(s),
            ...(status === 'unknown' ? {} : { body: JSON.stringify({ status: status.toUpperCase() }) }),
          });
          await refreshTokenIfNeeded(res);
          if (!res.ok) {
            return { ok: false, error: await getResponseError(res, `Server returned ${res.status}`) };
          }
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      }

      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!tab.id) continue;
        if (status === 'unknown') {
          chrome.tabs.sendMessage(tab.id, {
            type: 'WORD_KNOWLEDGE_DELETED',
            payload: { lemma: normalizedLemma },
          }).catch(() => {});
        } else {
          chrome.tabs.sendMessage(tab.id, {
            type: 'STATUS_CHANGED',
            payload: { lemma: normalizedLemma, status },
          }).catch(() => {});
        }
      }
      return { ok: true };
    }

    case 'DELETE_WORD_KNOWLEDGE': {
      const normalizedLemma = msg.payload.lemma.trim().toLowerCase();
      if (!normalizedLemma) return { ok: false, error: 'Lemma is required' };

      await deleteLexeme(normalizedLemma);

      const s = await getSettings();
      if (s.authToken) {
        const apiBase = s.apiBaseUrl || BACKEND_URL;
        try {
          const res = await fetch(`${apiBase}/api/word-knowledge/${encodeURIComponent(normalizedLemma)}`, {
            method: 'DELETE',
            headers: getAuthHeaders(s),
          });
          await refreshTokenIfNeeded(res);
          if (!res.ok) {
            return { ok: false, error: await getResponseError(res, `Server returned ${res.status}`) };
          }
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      }

      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'WORD_KNOWLEDGE_DELETED',
            payload: { lemma: normalizedLemma },
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
        const data = await backendExplainWord({ word, sentence, context, level });
        chrome.tabs.sendMessage(tabId, {
          type: 'AI_RESULT',
          payload: { requestId, result: { kind: 'explain-word', data } },
        }).catch(() => {});
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
        const data = await backendExplainSentence({ sentence, level });
        chrome.tabs.sendMessage(tabId, {
          type: 'AI_RESULT',
          payload: { requestId, result: { kind: 'explain-sentence', data } },
        }).catch(() => {});
      } catch (error) {
        chrome.tabs.sendMessage(tabId, {
          type: 'AI_STREAM_ERROR',
          payload: { requestId, error: (error as Error).message },
        }).catch(() => {});
      }
      return { ok: true };
    }

    case 'TRANSLATE_SENTENCE_WITH_AI': {
      const { sentence, requestId } = msg.payload;
      const tabId = sender.tab?.id;
      if (!tabId) return;
      try {
        const data = await backendTranslate(sentence);
        chrome.tabs.sendMessage(tabId, {
          type: 'AI_RESULT',
          payload: { requestId, result: { kind: 'translate', data } },
        }).catch(() => {});
      } catch (error) {
        chrome.tabs.sendMessage(tabId, {
          type: 'AI_STREAM_ERROR',
          payload: { requestId, error: (error as Error).message },
        }).catch(() => {});
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
      const apiBase = settings.apiBaseUrl || BACKEND_URL;
      const selectedCollectionId =
        card.collectionId != null
          ? Number(card.collectionId)
          : settings.activeCollectionId != null
            ? Number(settings.activeCollectionId)
            : null;
      const cardForRequest: FlashcardPayload = {
        ...card,
        exampleSentence: card.exampleSentence ?? `${card.surfaceForm} - from ${card.sourceTitle || 'web'}`,
        knowledgeStatus: card.knowledgeStatus ?? 'LEARNING',
      };
      const payload = buildBackendFlashcardPayload(cardForRequest, selectedCollectionId);
      try {
        const res = await fetch(`${apiBase}/api/flashcards`, {
          method: 'POST',
          headers: getAuthHeaders(settings),
          body: JSON.stringify(payload),
        });
        await refreshTokenIfNeeded(res);
        if (!res.ok) {
          return { ok: false, error: await getResponseError(res, `Server returned ${res.status}`) };
        }
        const json = await res.json();
        const serverCard = withDeckName(mapBackendFlashcard(json.data ?? {}, card.deckName || settings.activeCollectionName || 'Syntagma'));
        const flashcardId = Number(serverCard.id);
        console.log('[Syntagma] CREATE_FLASHCARD — flashcardId:', flashcardId, 'hasScreenshotData:', !!card.screenshotDataUrl, 'hasAudioData:', !!card.sentenceAudioDataUrl, 'audioDataLen:', card.sentenceAudioDataUrl?.length);
        const [screenshotUrl, audioUrl] = Number.isFinite(flashcardId)
          ? await Promise.all([
              uploadScreenshotMedia(apiBase, settings, flashcardId, card).catch((err) => {
                console.warn('[Syntagma] Screenshot upload failed:', err);
                return undefined;
              }),
              uploadAudioMedia(apiBase, settings, flashcardId, card).catch((err) => {
                console.warn('[Syntagma] Audio upload failed:', err);
                return undefined;
              }),
            ])
          : [undefined, undefined];
        console.log('[Syntagma] CREATE_FLASHCARD — uploadedScreenshot:', !!screenshotUrl, 'uploadedAudio:', !!audioUrl);
        const savedCard: FlashcardPayload = {
          ...mergeFlashcardWithLocalFields(cardForRequest, serverCard),
          collectionId: selectedCollectionId,
          screenshotDataUrl: screenshotUrl ?? card.screenshotDataUrl,
          audioUrl: audioUrl ?? card.audioUrl,
          sentenceAudioDataUrl: undefined,
        };
        await upsertFlashcardInLocalCache(settings, savedCard);
        return { ok: true, card: savedCard };
      } catch (err) {
        console.error('[Syntagma] Backend sync error:', err);
        return { ok: false, error: (err as Error).message };
      }
    }

    case 'UPDATE_FLASHCARD': {
      const settings = await getSettings();
      if (!settings.authToken) {
        return { ok: false, error: 'Not logged in' };
      }
      const { id, card, selectedCollectionId, mediaOps } = msg.payload;
      const apiBase = settings.apiBaseUrl || BACKEND_URL;
      const localCards = await getFlashcards();
      const existingCard = localCards.find(item => item.id === id);
      const screenshotOp = mediaOps?.screenshot ?? 'keep';
      const audioOp = mediaOps?.audio ?? 'keep';
      const cardForRequest: FlashcardPayload = {
        ...card,
        exampleSentence: card.exampleSentence ?? `${card.surfaceForm} - from ${card.sourceTitle || 'web'}`,
        knowledgeStatus: card.knowledgeStatus ?? 'LEARNING',
        screenshotDataUrl:
          screenshotOp === 'replace'
            ? card.screenshotDataUrl
            : screenshotOp === 'remove'
              ? undefined
              : card.screenshotDataUrl ?? existingCard?.screenshotDataUrl,
        audioUrl:
          audioOp === 'remove'
            ? undefined
            : card.audioUrl ?? existingCard?.audioUrl,
        sentenceAudioDataUrl:
          audioOp === 'replace'
            ? card.sentenceAudioDataUrl
            : audioOp === 'remove'
              ? undefined
              : card.sentenceAudioDataUrl ?? existingCard?.sentenceAudioDataUrl,
      };
      const payload = buildBackendFlashcardPayload(cardForRequest, selectedCollectionId);
      try {
        const res = await fetch(`${apiBase}/api/flashcards/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: getAuthHeaders(settings),
          body: JSON.stringify(payload),
        });
        await refreshTokenIfNeeded(res);
        if (!res.ok) {
          return { ok: false, error: await getResponseError(res, `Server returned ${res.status}`) };
        }
        const json = await res.json();
        const serverCard = withDeckName(mapBackendFlashcard(json.data ?? {}, card.deckName || settings.activeCollectionName || 'Syntagma'));
        const numericFlashcardId = Number(serverCard.id || id);
        const cacheResult = await chrome.storage.local.get(MEDIA_URL_CACHE_KEY);
        const mediaCache = (cacheResult[MEDIA_URL_CACHE_KEY] ?? {}) as MediaUrlCache;

        if ((screenshotOp === 'replace' && !cardForRequest.screenshotDataUrl) || (audioOp === 'replace' && !cardForRequest.sentenceAudioDataUrl)) {
          return { ok: false, error: 'Missing replacement media file.' };
        }

        if (screenshotOp !== 'keep' || audioOp !== 'keep') {
          const currentAssets = await fetchFlashcardMediaAssets(apiBase, settings, id);
          if (screenshotOp !== 'keep') {
            const currentScreenshot = pickLatestMediaAsset(currentAssets, 'SCREENSHOT');
            if (currentScreenshot) {
              await deleteMediaAssetById(apiBase, settings, currentScreenshot.mediaId);
            }
          }
          if (audioOp !== 'keep') {
            const currentAudio = pickLatestMediaAsset(currentAssets, 'AUDIO');
            if (currentAudio) {
              await deleteMediaAssetById(apiBase, settings, currentAudio.mediaId);
            }
          }
        }

        let uploadedScreenshotUrl: string | undefined;
        let uploadedAudioUrl: string | undefined;
        if (Number.isFinite(numericFlashcardId)) {
          if (screenshotOp === 'replace') {
            uploadedScreenshotUrl = await uploadScreenshotMedia(apiBase, settings, numericFlashcardId, cardForRequest).catch(() => undefined);
          }
          if (audioOp === 'replace') {
            uploadedAudioUrl = await uploadAudioMedia(apiBase, settings, numericFlashcardId, cardForRequest).catch(() => undefined);
          }
        }

        delete mediaCache[id];
        const refreshedUrls: { screenshotUrl?: string; audioUrl?: string } =
          await getMediaUrls(apiBase, settings, id, mediaCache).catch(() => ({}));
        const savedCard: FlashcardPayload = {
          ...mergeFlashcardWithLocalFields(cardForRequest, serverCard),
          collectionId: selectedCollectionId,
          screenshotDataUrl:
            screenshotOp === 'remove'
              ? undefined
              : refreshedUrls.screenshotUrl ?? uploadedScreenshotUrl ?? cardForRequest.screenshotDataUrl,
          audioUrl:
            audioOp === 'remove'
              ? undefined
              : refreshedUrls.audioUrl ?? uploadedAudioUrl ?? cardForRequest.audioUrl,
          sentenceAudioDataUrl: undefined,
        };
        await upsertFlashcardInLocalCache(settings, savedCard);
        await chrome.storage.local.set({ [MEDIA_URL_CACHE_KEY]: mediaCache });
        return { ok: true, card: savedCard };
      } catch (err) {
        console.error('[Syntagma] Failed to update flashcard:', err);
        return { ok: false, error: (err as Error).message };
      }
    }

    case 'FETCH_FLASHCARDS': {
      const settings = await getSettings();
      if (!settings.authToken) {
        return { ok: false, error: 'Not logged in' };
      }
      const apiBase = settings.apiBaseUrl || BACKEND_URL;
      try {
        const res = await fetch(`${apiBase}/api/flashcards?size=100&sort=createdAt,desc`, {
          headers: getAuthHeaders(settings),
        });
        await refreshTokenIfNeeded(res);
        if (!res.ok) {
          return { ok: false, error: await getResponseError(res, `Server returned ${res.status}`) };
        }
        const json = await res.json();
        const content = json.data?.content ?? json.data ?? [];
        console.log('[Syntagma] Fetched flashcards raw sample:', JSON.stringify(content[0]));
        const baseCards = content.map((fc: unknown) => withDeckName(mapBackendFlashcard(fc as Record<string, unknown>)));
        console.log('[Syntagma] Mapped cards sample:', JSON.stringify(baseCards[0]));
        const cacheResult = await chrome.storage.local.get(MEDIA_URL_CACHE_KEY);
        const mediaCache = (cacheResult[MEDIA_URL_CACHE_KEY] ?? {}) as MediaUrlCache;
        const cards = await mapWithConcurrency(baseCards, 4, async (card: FlashcardPayload) => {
          const urls = await getMediaUrls(apiBase, settings, card.id, mediaCache);
          return {
            ...card,
            screenshotDataUrl: urls.screenshotUrl,
            audioUrl: urls.audioUrl,
          };
        });
        const fcKey = userScopedKey('flashcards', settings.authUserId);
        await chrome.storage.local.set({
          [fcKey]: cards,
          [MEDIA_URL_CACHE_KEY]: mediaCache,
        });
        return { ok: true, cards };
      } catch (err) {
        console.error('[Syntagma] Failed to fetch flashcards:', err);
        return { ok: false, error: (err as Error).message };
      }
    }

    case 'DELETE_FLASHCARD': {
      const settings = await getSettings();
      if (!settings.authToken) {
        return { ok: false, error: 'Not logged in' };
      }
      const apiBase = settings.apiBaseUrl || BACKEND_URL;
      try {
        const res = await fetch(`${apiBase}/api/flashcards/${encodeURIComponent(msg.payload.id)}`, {
          method: 'DELETE',
          headers: getAuthHeaders(settings),
        });
        await refreshTokenIfNeeded(res);
        if (!res.ok) {
          return { ok: false, error: await getResponseError(res, `Server returned ${res.status}`) };
        }
        await removeFlashcardFromLocalCache(settings, msg.payload.id);
        return { ok: true };
      } catch (err) {
        console.error('[Syntagma] Failed to delete flashcard:', err);
        return { ok: false, error: (err as Error).message };
      }
    }

    case 'FETCH_COLLECTIONS': {
      const settings = await getSettings();
      if (!settings.authToken) {
        return { ok: false, error: 'Not logged in' };
      }
      const apiBase = settings.apiBaseUrl || BACKEND_URL;
      const collHeaders = { ...getAuthHeaders(settings), 'X-User-Id': settings.authUserId ?? '' };
      try {
        const res = await fetch(`${apiBase}/api/collections?size=50&sort=createdAt,desc`, {
          headers: collHeaders,
        });
        await refreshTokenIfNeeded(res);
        if (!res.ok) {
          return { ok: false, error: await getResponseError(res, `Server returned ${res.status}`) };
        }
        const json = await res.json();
        const content = json.data?.content ?? json.data ?? [];
        return { ok: true, collections: content };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }

    case 'CREATE_COLLECTION': {
      const settings = await getSettings();
      if (!settings.authToken) {
        return { ok: false, error: 'Not logged in' };
      }
      const apiBase = settings.apiBaseUrl || BACKEND_URL;
      const collHeaders = { ...getAuthHeaders(settings), 'X-User-Id': settings.authUserId ?? '' };
      try {
        const res = await fetch(`${apiBase}/api/collections`, {
          method: 'POST',
          headers: collHeaders,
          body: JSON.stringify({ name: msg.payload.name }),
        });
        await refreshTokenIfNeeded(res);
        if (!res.ok) {
          return { ok: false, error: await getResponseError(res, `Server returned ${res.status}`) };
        }
        const json = await res.json();
        return { ok: true, collection: json.data };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }

    case 'DELETE_COLLECTION': {
      const settings = await getSettings();
      if (!settings.authToken) {
        return { ok: false, error: 'Not logged in' };
      }
      const apiBase = settings.apiBaseUrl || BACKEND_URL;
      const collHeaders = { ...getAuthHeaders(settings), 'X-User-Id': settings.authUserId ?? '' };
      try {
        const res = await fetch(`${apiBase}/api/collections/${encodeURIComponent(msg.payload.id)}`, {
          method: 'DELETE',
          headers: collHeaders,
        });
        await refreshTokenIfNeeded(res);
        if (!res.ok) {
          return { ok: false, error: await getResponseError(res, `Server returned ${res.status}`) };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
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
      const { email, password, learnerLevel } = msg.payload;
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
          await setSettings({ authToken: token, authEmail: userEmail, authUserId: userId, learnerLevel });
          // Apply CEFR known words for the newly set learner level
          applyKnownWordsForLevel(learnerLevel).catch(err =>
            console.warn('[Syntagma] CEFR intake after register error:', err)
          );
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

    case 'OPEN_READER': {
      chrome.tabs.create({ url: chrome.runtime.getURL('reader.html') });
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
      let params: URLSearchParams;
      if (msg.payload.mode === 'edit') {
        const settings = await getSettings();
        const apiBase = settings.apiBaseUrl || BACKEND_URL;
        const cacheResult = await chrome.storage.local.get(MEDIA_URL_CACHE_KEY);
        const mediaCache = (cacheResult[MEDIA_URL_CACHE_KEY] ?? {}) as MediaUrlCache;
        let draftCard = msg.payload.card;
        if (settings.authToken && draftCard.id) {
          const refreshedUrls: { screenshotUrl?: string; audioUrl?: string } =
            await getMediaUrls(apiBase, settings, draftCard.id, mediaCache).catch(() => ({}));
          draftCard = {
            ...draftCard,
            screenshotDataUrl: refreshedUrls.screenshotUrl ?? draftCard.screenshotDataUrl,
            audioUrl: refreshedUrls.audioUrl ?? draftCard.audioUrl,
          };
        }
        const draftKey = `${CARD_CREATOR_DRAFT_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await chrome.storage.local.set({
          [draftKey]: draftCard,
          [MEDIA_URL_CACHE_KEY]: mediaCache,
        });
        params = new URLSearchParams({ mode: 'edit', draftKey });
      } else {
        const { panel, word, sentence, sourceUrl, sourceTitle, trMeaning, screenshotDataUrl, sentenceAudioDataUrl } = msg.payload;
        console.log('[Syntagma] OPEN_CARD_CREATOR create — hasScreenshot:', !!screenshotDataUrl, 'hasAudio:', !!sentenceAudioDataUrl);

        let draftKey: string | undefined = undefined;
        if (screenshotDataUrl || sentenceAudioDataUrl) {
          draftKey = `${CARD_CREATOR_DRAFT_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
          await chrome.storage.local.set({
            [draftKey]: {
              lemma: word,
              surfaceForm: word,
              sentence,
              sourceUrl,
              sourceTitle,
              trMeaning,
              screenshotDataUrl,
              sentenceAudioDataUrl,
            }
          });
        }
        
        params = new URLSearchParams({
          mode: 'create',
          panel: panel ?? 'dictionary',
          word,
          sentence,
          sourceUrl,
          sourceTitle,
          ...(trMeaning ? { trMeaning } : {}),
          ...(draftKey ? { draftKey } : {}),
        });
      }
      await openCardCreatorWindow(params);
      return { ok: true };
    }

    case 'UPLOAD_SENTENCE_AUDIO': {
      const { flashcardId, audioDataUrl, mimeType, sentence, videoUrl } = msg.payload;
      const settings = await getSettings();
      if (!settings.authToken) return { ok: false, error: 'Not logged in' };

      const apiBase = settings.apiBaseUrl || BACKEND_URL;
      try {
        // 1. Convert data URL 竊・Blob
        const resp = await fetch(audioDataUrl);
        const blob = await resp.blob();
        const ext = mimeType.includes('webm') ? 'webm' : 'ogg';
        const fileName = `sentence_audio_${flashcardId}_${Date.now()}.${ext}`;

        // 2. Get presigned upload URL from backend
        const presignRes = await fetch(`${apiBase}/api/media/presign`, {
          method: 'POST',
          headers: getAuthHeaders(settings),
          body: JSON.stringify({
            flashcardId,
            type: 'AUDIO',
            fileName,
            contentType: mimeType,
            size: blob.size,
          }),
        });
        await refreshTokenIfNeeded(presignRes);
        if (!presignRes.ok) {
          const errText = await presignRes.text();
          return { ok: false, error: `Presign failed (${presignRes.status}): ${errText}` };
        }
        const presignData = await presignRes.json();
        const { uploadUrl, objectKey } = presignData.data ?? presignData;

        // 3. Upload audio blob directly to S3
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: blob,
        });
        if (!uploadRes.ok) {
          return { ok: false, error: `S3 upload failed (${uploadRes.status})` };
        }

        // 4. Create media asset record in backend
        const createRes = await fetch(`${apiBase}/api/media`, {
          method: 'POST',
          headers: getAuthHeaders(settings),
          body: JSON.stringify({
            flashcardId,
            type: 'AUDIO',
            objectKey,
            originalFileName: fileName,
            contentType: mimeType,
            size: blob.size,
          }),
        });
        await refreshTokenIfNeeded(createRes);
        if (!createRes.ok) {
          const errText = await createRes.text();
          return { ok: false, error: `Media record creation failed (${createRes.status}): ${errText}` };
        }
        const createData = await createRes.json();
        return { ok: true, mediaId: createData.data?.mediaId ?? createData.mediaId };
      } catch (err) {
        console.error('[Syntagma] Audio upload failed:', err);
        return { ok: false, error: (err as Error).message };
      }
    }

    default:
      return;
  }
});

// Context menu for "Look up in Syntagma"
// Must be created inside onInstalled 窶・not at module top level.
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
