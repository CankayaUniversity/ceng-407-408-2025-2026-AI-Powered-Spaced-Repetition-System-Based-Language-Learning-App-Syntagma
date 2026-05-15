import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardCreatorApp } from './CardCreatorApp';
import type { FlashcardPayload, UserSettings } from '../shared/types';

const sendMessageMock = vi.fn();

vi.mock('../shared/messages', () => ({
  sendMessage: (msg: unknown) => sendMessageMock(msg),
}));

function buildSettings(): UserSettings {
  return {
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
    aiModel: 'model',
    aiApiKey: null,
    forvoApiKey: null,
    ankiConnectUrl: 'http://localhost:8765',
    ankiDeckName: 'Syntagma',
    apiBaseUrl: '',
    authToken: 'token',
    authEmail: 'test@example.com',
    authUserId: '1',
    activeCollectionId: 3,
    activeCollectionName: 'Deck 3',
    uiLocale: 'en',
  };
}

function setupChromeStorage(seed: Record<string, unknown> = {}) {
  const store = { ...seed };
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>();

  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
    },
    storage: {
      local: {
        get: vi.fn(async (key?: string | string[] | null) => {
          if (!key) return { ...store };
          if (Array.isArray(key)) {
            const out: Record<string, unknown> = {};
            key.forEach(item => { out[item] = store[item]; });
            return out;
          }
          return { [key]: store[key] };
        }),
        set: vi.fn(async (patch: Record<string, unknown>) => {
          Object.assign(store, patch);
        }),
        remove: vi.fn(async (key: string) => {
          delete store[key];
        }),
      },
      onChanged: {
        addListener: vi.fn((listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
          listeners.add(listener);
        }),
        removeListener: vi.fn((listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
          listeners.delete(listener);
        }),
      },
    },
  };
}

describe('CardCreatorApp workspace', () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
    Object.defineProperty(window, 'close', { value: vi.fn(), writable: true });
  });

  it('sends CREATE_FLASHCARD in create mode', async () => {
    window.history.pushState({}, '', '/card-creator.html?mode=create&word=hello&sentence=hello%20world&sourceUrl=https://example.com&sourceTitle=Example');
    setupChromeStorage({ flashcards_1: [], lexemes_1: {} });

    sendMessageMock.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'GET_SETTINGS') return buildSettings();
      if (msg.type === 'FETCH_COLLECTIONS') return { ok: true, collections: [{ collectionId: 3, name: 'Deck 3' }] };
      if (msg.type === 'FETCH_FLASHCARDS') return { ok: true, cards: [] };
      if (msg.type === 'LOOKUP_DICTIONARY') return { translations: ['merhaba'] };
      if (msg.type === 'CREATE_FLASHCARD') return { ok: true };
      return { ok: true };
    });

    render(<CardCreatorApp />);
    await screen.findByText('Create Card');

    fireEvent.change(screen.getByPlaceholderText('Meaning in Turkish'), { target: { value: 'Merhaba' } });
    fireEvent.click(screen.getByText('Create Card'));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
        type: 'CREATE_FLASHCARD',
        payload: expect.objectContaining({
          lemma: 'hello',
          trMeaning: 'Merhaba',
        }),
      }));
    });
  });

  it('loads draft and sends UPDATE_FLASHCARD with media ops in edit mode', async () => {
    const draft: FlashcardPayload = {
      id: 'fc-10',
      lemma: 'hello',
      surfaceForm: 'Hello',
      sentence: 'Hello world',
      exampleSentence: 'Example sentence',
      sourceUrl: 'https://example.com',
      sourceTitle: 'Example',
      trMeaning: 'Merhaba',
      knowledgeStatus: 'LEARNING',
      createdAt: Date.now(),
      deckName: 'Deck 3',
      tags: ['syntagma'],
      collectionId: 3,
      collectionIds: [3],
      audioUrl: 'https://example.com/audio.mp3',
      screenshotDataUrl: 'https://example.com/image.jpg',
    };

    window.history.pushState({}, '', '/card-creator.html?mode=edit&draftKey=draft-1');
    setupChromeStorage({ 'draft-1': draft, flashcards_1: [draft], lexemes_1: {} });

    sendMessageMock.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'GET_SETTINGS') return buildSettings();
      if (msg.type === 'FETCH_COLLECTIONS') return { ok: true, collections: [{ collectionId: 3, name: 'Deck 3' }] };
      if (msg.type === 'FETCH_FLASHCARDS') return { ok: true, cards: [draft] };
      if (msg.type === 'LOOKUP_DICTIONARY') return { translations: [] };
      if (msg.type === 'UPDATE_FLASHCARD') return { ok: true, card: { ...draft, audioUrl: undefined } };
      return { ok: true };
    });

    render(<CardCreatorApp />);
    await screen.findByText('Save Changes');

    const removeButtons = screen.getAllByText('Remove');
    fireEvent.click(removeButtons[1]);
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
        type: 'UPDATE_FLASHCARD',
        payload: expect.objectContaining({
          id: 'fc-10',
          selectedCollectionId: 3,
          mediaOps: expect.objectContaining({ audio: 'remove' }),
        }),
      }));
    });
  });

  it('opens settings page from sidebar action', async () => {
    window.history.pushState({}, '', '/card-creator.html?mode=create');
    setupChromeStorage({ flashcards_1: [], lexemes_1: {} });

    sendMessageMock.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'GET_SETTINGS') return buildSettings();
      if (msg.type === 'FETCH_COLLECTIONS') return { ok: true, collections: [] };
      if (msg.type === 'FETCH_FLASHCARDS') return { ok: true, cards: [] };
      if (msg.type === 'OPEN_OPTIONS_PAGE') return { ok: true };
      return { ok: true };
    });

    render(<CardCreatorApp />);
    await screen.findByText('Settings');
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
        type: 'OPEN_OPTIONS_PAGE',
      }));
    });
  });
});
