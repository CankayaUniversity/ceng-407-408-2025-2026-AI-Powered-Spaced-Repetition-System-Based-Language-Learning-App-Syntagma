import { getSettings } from '../shared/storage';
import { sendMessage } from '../shared/messages';
import { initFrequencyTable } from '../shared/frequency';
import type { UserSettings, LexemeEntry, WordStatus } from '../shared/types';
import { parsePage, extractSentence } from './parser';
import {
  injectOverlays,
  removeOverlays,
  updateWordStatus,
  applyStatusColors,
  applyInlineTranslations,
  countByStatus,
} from './overlay';
import { mountHeaderBar, updateHeaderBar, unmountHeaderBar } from './header-bar';
import { mountWordPopup, dismissWordPopup } from './popup/WordPopup';

// ─── State ──────────────────────────────────────────────────────────────────

let currentSettings: UserSettings | null = null;
let currentLexemes: Record<string, LexemeEntry> = {};
let isParsed = false;
let isParsing = false;

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  try {
    // Load settings and frequency table in parallel
    const [settings] = await Promise.all([
      getSettings(),
      initFrequencyTable(),
    ]);

    currentSettings = settings;
    console.log('[Syntagma] settings loaded — enabled:', settings.enabled, 'autoParseOnLoad:', settings.autoParseOnLoad);

    if (!settings.enabled) {
      console.log('[Syntagma] disabled, exiting');
      return;
    }

    // Fetch lexemes from background service worker.
    // If the SW isn't ready yet, retry once after a short delay.
    try {
      const response = await sendMessage<{ lexemes: Record<string, LexemeEntry> }>({
        type: 'PARSE_PAGE_FOR_COMPREHENSION',
        payload: { tabId: 0, pageUrl: window.location.href },
      });
      currentLexemes = (response?.lexemes) ?? {};
    } catch {
      // SW may not be awake yet — retry after 500ms
      await new Promise(r => setTimeout(r, 500));
      try {
        const response = await sendMessage<{ lexemes: Record<string, LexemeEntry> }>({
          type: 'PARSE_PAGE_FOR_COMPREHENSION',
          payload: { tabId: 0, pageUrl: window.location.href },
        });
        currentLexemes = (response?.lexemes) ?? {};
      } catch {
        // Still failing — proceed with empty lexemes (all words = unknown)
        currentLexemes = {};
      }
    }

    // Mount header bar
    mountHeaderBar({
      settings,
      isParsing: false,
      comprehensionPercent: null,
      wordCounts: null,
      onParse: handleParse,
      onToggleColors: handleToggleColors,
      onToggleTranslations: handleToggleTranslations,
      onOpenSettings: handleOpenSettings,
    });

    // Set up click handler for word elements (delegated)
    document.addEventListener('click', handleWordClick, { capture: false });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyDown);

    // Auto-parse if enabled
    if (settings.autoParseOnLoad) {
      await handleParse();
    }

  } catch (err) {
    console.error('[Syntagma] init error:', err);
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function handleParse() {
  if (isParsing || !currentSettings) {
    console.log('[Syntagma] handleParse blocked — isParsing:', isParsing, 'hasSettings:', !!currentSettings);
    return;
  }
  console.log('[Syntagma] handleParse started');
  isParsing = true;

  updateHeaderBar({
    settings: currentSettings,
    isParsing: true,
    comprehensionPercent: null,
    wordCounts: null,
    onParse: handleParse,
    onToggleColors: handleToggleColors,
    onToggleTranslations: handleToggleTranslations,
    onOpenSettings: handleOpenSettings,
  });

  try {
    // Remove previous overlays if any
    if (isParsed) {
      removeOverlays();
    }

    const result = await parsePage(
      currentLexemes,
      (_processed, _total) => {
        // Could update progress here
      }
    );

    console.log(`[Syntagma] parsePage done — ${result.tokens.length} tokens, ${result.textNodes.length} text nodes`);
    injectOverlays(result, currentLexemes);
    isParsed = true;

    // Apply initial settings
    applyStatusColors(currentSettings.showLearningStatusColors);
    if (currentSettings.showInlineTranslations) {
      applyInlineTranslations(true, currentLexemes);
    }

    // Compute comprehension stats
    const counts = countByStatus(currentLexemes);
    const comprehensionPercent = counts.total > 0
      ? Math.round(((counts.known + 0.5 * counts.learning) / counts.total) * 100)
      : 0;

    updateHeaderBar({
      settings: currentSettings,
      isParsing: false,
      comprehensionPercent,
      wordCounts: {
        total: counts.total,
        known: counts.known,
        learning: counts.learning,
        unknown: counts.unknown,
      },
      onParse: handleParse,
      onToggleColors: handleToggleColors,
      onToggleTranslations: handleToggleTranslations,
      onOpenSettings: handleOpenSettings,
    });

  } catch (err) {
    console.error('[Syntagma] parse error:', err);
  } finally {
    isParsing = false;
  }
}

function handleWordClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const wordEl = target.closest('span[data-syn]') as HTMLElement | null;

  if (!wordEl || !currentSettings) return;

  e.stopPropagation();

  const lemma = wordEl.getAttribute('data-syn') ?? '';
  const surface = wordEl.dataset.surface ?? wordEl.textContent ?? '';
  const lexeme = currentLexemes[lemma] ?? null;

  // Extract sentence context
  const textNode = wordEl.firstChild as Text | null;
  const sentence = textNode
    ? extractSentence(textNode, 0)
    : wordEl.closest('p, div, li, td')?.textContent?.slice(0, 200) ?? '';

  const anchorRect = wordEl.getBoundingClientRect();

  mountWordPopup({
    lemma,
    surface,
    sentence: sentence.trim(),
    anchorRect,
    lexeme,
    settings: currentSettings,
    onClose: dismissWordPopup,
    onStatusChange: handleStatusChange,
  });
}

function handleStatusChange(lemma: string, status: WordStatus) {
  if (currentLexemes[lemma]) {
    currentLexemes[lemma].status = status;
  } else {
    const now = Date.now();
    currentLexemes[lemma] = {
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
  updateWordStatus(lemma, status);

  // Re-compute comprehension
  if (isParsed && currentSettings?.showComprehensionHeader) {
    const counts = countByStatus(currentLexemes);
    const comprehensionPercent = counts.total > 0
      ? Math.round(((counts.known + 0.5 * counts.learning) / counts.total) * 100)
      : 0;
    updateHeaderBar({
      settings: currentSettings!,
      isParsing: false,
      comprehensionPercent,
      wordCounts: {
        total: counts.total,
        known: counts.known,
        learning: counts.learning,
        unknown: counts.unknown,
      },
      onParse: handleParse,
      onToggleColors: handleToggleColors,
      onToggleTranslations: handleToggleTranslations,
      onOpenSettings: handleOpenSettings,
    });
  }
}

function handleToggleColors(enabled: boolean) {
  if (!currentSettings) return;
  currentSettings = { ...currentSettings, showLearningStatusColors: enabled };
  applyStatusColors(enabled);
  sendMessage({ type: 'SET_SETTINGS', payload: { showLearningStatusColors: enabled } }).catch(console.error);
}

function handleToggleTranslations(enabled: boolean) {
  if (!currentSettings) return;
  currentSettings = { ...currentSettings, showInlineTranslations: enabled };
  applyInlineTranslations(enabled, currentLexemes);
  sendMessage({ type: 'SET_SETTINGS', payload: { showInlineTranslations: enabled } }).catch(console.error);
}

function handleOpenSettings() {
  chrome.runtime.openOptionsPage?.();
}

function handleKeyDown(e: KeyboardEvent) {
  // Alt+P = parse page
  if (e.altKey && e.key === 'p') {
    e.preventDefault();
    handleParse();
    return;
  }
  // Escape = dismiss popup
  if (e.key === 'Escape') {
    dismissWordPopup();
  }
}

// ─── Message listener (from background) ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PARSE_PAGE') {
    handleParse().catch(console.error);
    return;
  }

  if (msg.type === 'STATUS_CHANGED') {
    const { lemma, status } = msg.payload as { lemma: string; status: WordStatus };
    if (currentLexemes[lemma]) {
      currentLexemes[lemma].status = status;
    }
    if (isParsed) {
      updateWordStatus(lemma, status);
    }
  }

  if (msg.type === 'SETTINGS_UPDATED') {
    const patch = msg.payload as Partial<UserSettings>;
    if (currentSettings) {
      currentSettings = { ...currentSettings, ...patch };
    }

    if (patch.enabled === false) {
      removeOverlays();
      unmountHeaderBar();
      isParsed = false;
    }

    if (patch.showLearningStatusColors !== undefined) {
      applyStatusColors(patch.showLearningStatusColors);
    }

    if (patch.showInlineTranslations !== undefined) {
      applyInlineTranslations(patch.showInlineTranslations, currentLexemes);
    }
  }

  if (msg.type === 'LOOKUP_WORD') {
    // Context menu lookup - show popup for the word
    const { lemma } = msg.payload as { lemma: string };
    if (!lemma || !currentSettings) return;

    const wordEl = document.querySelector(`span[data-syn="${CSS.escape(lemma)}"]`) as HTMLElement | null;
    if (wordEl) {
      wordEl.click();
    } else {
      // Word not yet parsed - show basic popup at center of viewport
      const fakeRect = {
        top: window.innerHeight / 2 - 150,
        bottom: window.innerHeight / 2 - 150,
        left: window.innerWidth / 2 - 170,
        right: window.innerWidth / 2 + 170,
        width: 340,
        height: 0,
        x: window.innerWidth / 2 - 170,
        y: window.innerHeight / 2 - 150,
        toJSON: () => ({}),
      } as DOMRect;

      mountWordPopup({
        lemma,
        surface: lemma,
        sentence: '',
        anchorRect: fakeRect,
        lexeme: currentLexemes[lemma] ?? null,
        settings: currentSettings,
        onClose: dismissWordPopup,
        onStatusChange: handleStatusChange,
      });
    }
  }
});

// ─── Boot ────────────────────────────────────────────────────────────────────

// Only run in main frame
if (window === window.top) {
  console.log('[Syntagma] content script loaded on', window.location.href);
  init().catch(console.error);
}

// Export parsePage for external callers
export { handleParse as parsePage };
