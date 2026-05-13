import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OptionsApp } from './OptionsApp';
import type { UserSettings } from '../shared/types';

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
    activeCollectionId: 5,
    activeCollectionName: 'Deck Five',
  };
}

function setupChromeStorage() {
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
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

describe('OptionsApp', () => {
  beforeEach(() => {
    setupChromeStorage();
    sendMessageMock.mockReset();
  });

  it('shows simplified tabs and opens workspace from settings page', async () => {
    sendMessageMock.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'GET_SETTINGS') return buildSettings();
      if (msg.type === 'OPEN_CARD_CREATOR') return { ok: true };
      return { ok: true };
    });

    render(<OptionsApp />);

    await screen.findByText('General');
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.queryByText('Word Browser')).not.toBeInTheDocument();
    expect(screen.queryByText('Flashcards')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Open Workspace'));
    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
        type: 'OPEN_CARD_CREATOR',
        payload: expect.objectContaining({
          mode: 'create',
          panel: 'home',
        }),
      }));
    });
  });
});
