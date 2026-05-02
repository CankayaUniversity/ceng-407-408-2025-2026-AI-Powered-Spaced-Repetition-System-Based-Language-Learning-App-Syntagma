import { getSettings } from '../shared/storage';
import { sendMessage } from '../shared/messages';
import { initFrequencyTable } from '../shared/frequency';
import type { UserSettings, LexemeEntry, WordStatus, Token, FlashcardPayload } from '../shared/types';
import { parsePage } from './parser';
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
import { initVideoMode, destroyVideoMode } from './video';
import { injectNetflixInterceptor } from './video/subtitle-capture';

// Inject interceptor immediately at document_start to catch initial network requests!
if (window.location.hostname.includes('netflix.com')) {
  injectNetflixInterceptor();
}

// ─── State ────────────────────────────────────────────────────────────────────

let currentSettings: UserSettings | null = null;
let currentLexemes: Record<string, LexemeEntry> = {};
let currentTokens: Token[] = [];
let isParsed = false;
let isParsing = false;
let shiftMode = false;

// ─── Sentence extraction ──────────────────────────────────────────────────────

function getSentenceForWord(wordEl: HTMLElement): string {
  // Walk up the DOM to find the tightest element that contains the full sentence.
  // Prefer semantic block elements; fall back to the nearest non-inline ancestor.
  let block = wordEl.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th') as HTMLElement | null;
  if (!block) {
    const INLINE = new Set(['SPAN', 'A', 'B', 'I', 'EM', 'STRONG', 'U', 'S', 'MARK', 'SMALL', 'SUB', 'SUP', 'CODE', 'ABBR', 'CITE', 'Q']);
    let el: HTMLElement | null = wordEl.parentElement;
    while (el && el !== document.body) {
      if (!INLINE.has(el.tagName)) { block = el; break; }
      el = el.parentElement;
    }
  }
  const root = block ?? wordEl.parentElement ?? wordEl;
  const blockText = root.textContent ?? '';
  if (!blockText) return wordEl.closest('span.syn-sentence')?.textContent?.trim() ?? '';

  // Walk text nodes to find the character offset of the word inside the block
  const surface = wordEl.dataset.surface ?? wordEl.textContent?.trim() ?? '';
  let offset = 0;
  let wordOffset = -1;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (wordEl.contains(node as Node)) {
      const idx = (node.textContent ?? '').indexOf(surface);
      wordOffset = offset + (idx >= 0 ? idx : 0);
      break;
    }
    offset += (node.textContent ?? '').length;
  }
  if (wordOffset < 0) wordOffset = blockText.indexOf(surface);
  if (wordOffset < 0) return wordEl.closest('span.syn-sentence')?.textContent?.trim() ?? '';

  // Find sentence boundaries in block text and return the one containing wordOffset
  const starts: number[] = [0];
  const re = /[.!?]+\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blockText)) !== null) starts.push(m.index + m[0].length);
  starts.push(blockText.length);

  for (let i = 0; i < starts.length - 1; i++) {
    if (wordOffset >= starts[i] && wordOffset < starts[i + 1]) {
      return blockText.slice(starts[i], starts[i + 1]).trim();
    }
  }
  return blockText.slice(0, 300).trim();
}

// ─── Header update helper ─────────────────────────────────────────────────────

function refreshHeader(overrides: Partial<Parameters<typeof mountHeaderBar>[0]> = {}) {
  if (!currentSettings) return;
  updateHeaderBar({
    settings: currentSettings,
    tokens: currentTokens,
    lexemes: currentLexemes,
    isParsing,
    shiftMode,
    onParse: handleParse,
    onToggleColors: handleToggleColors,
    onToggleTranslations: handleToggleTranslations,
    onOpenSettings: handleOpenSettings,
    onQuickAddCard: handleQuickAddCard,
    onOpenAdvancedCreator: handleOpenAdvancedCreator,
    ...overrides,
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const [settings] = await Promise.all([getSettings(), initFrequencyTable()]);
    currentSettings = settings;

    if (!settings.enabled) return;
    if (!settings.authToken) return;

    // Fetch lexemes; retry once if SW isn't ready
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await sendMessage<{ lexemes: Record<string, LexemeEntry> }>({
          type: 'PARSE_PAGE_FOR_COMPREHENSION',
          payload: { tabId: 0, pageUrl: window.location.href },
        });
        currentLexemes = res?.lexemes ?? {};
        break;
      } catch {
        if (attempt === 0) await new Promise(r => setTimeout(r, 500));
        else currentLexemes = {};
      }
    }

    mountHeaderBar({
      settings,
      tokens: currentTokens,
      lexemes: currentLexemes,
      isParsing: false,
      shiftMode: false,
      onParse: handleParse,
      onToggleColors: handleToggleColors,
      onToggleTranslations: handleToggleTranslations,
      onOpenSettings: handleOpenSettings,
      onQuickAddCard: handleQuickAddCard,
      onOpenAdvancedCreator: handleOpenAdvancedCreator,
    });

    document.addEventListener('click', handleWordClick, { capture: true });
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    if (settings.autoParseOnLoad) await handleParse();

    // ── Video mode ─────────────────────────────────────────────────────────
    const isVideoPage =
      window.location.href.includes('youtube.com/watch') ||
      window.location.href.includes('netflix.com/watch');

    if (isVideoPage) {
      initVideoMode({
        settings,
        lexemes: currentLexemes,
        onStatusChange: handleStatusChange,
        onSettingsChange: (patch) => {
          if (currentSettings) currentSettings = { ...currentSettings, ...patch };
        },
      }).catch(console.error);
    }

  } catch (err) {
    console.error('[Syntagma] init error:', err);
  }
}

// ─── Parse ────────────────────────────────────────────────────────────────────

export async function handleParse() {
  if (isParsing || !currentSettings || !currentSettings.enabled) return;
  isParsing = true;
  refreshHeader();

  try {
    if (isParsed) removeOverlays();

    const result = await parsePage(currentLexemes, () => {});
    currentTokens = result.tokens;
    injectOverlays(result, currentLexemes);
    isParsed = true;

    applyStatusColors(currentSettings.showLearningStatusColors);
    if (currentSettings.showInlineTranslations) applyInlineTranslations(true, currentLexemes);

  } catch (err) {
    console.error('[Syntagma] parse error:', err);
  } finally {
    isParsing = false;
    refreshHeader();
  }
}

// ─── Quick card creation ──────────────────────────────────────────────────────

async function handleQuickAddCard(lemma: string, sentence: string): Promise<void> {
  if (!currentSettings) throw new Error('Settings not loaded');

  const card: FlashcardPayload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    lemma,
    surfaceForm: lemma,
    sentence,
    sourceUrl: window.location.href,
    sourceTitle: document.title,
    trMeaning: currentLexemes[lemma]?.trMeaning ?? '',
    createdAt: Date.now(),
    deckName: currentSettings.ankiDeckName,
    tags: ['syntagma', 'quick-add'],
  };

  await sendMessage({ type: 'CREATE_FLASHCARD', payload: card });
}

// ─── Advanced Card Creator ────────────────────────────────────────────────────

function handleOpenAdvancedCreator(lemma?: string, sentence?: string) {
  dismissWordPopup();
  sendMessage({
    type: 'OPEN_CARD_CREATOR',
    payload: {
      word: lemma ?? '',
      sentence: sentence ?? '',
      sourceUrl: window.location.href,
      sourceTitle: document.title,
    },
  }).catch(console.error);
}

// ─── Word click ───────────────────────────────────────────────────────────────

function handleWordClick(e: MouseEvent) {
  if (shiftMode) return;

  const target = e.target as HTMLElement;
  const wordEl = target.closest('span[data-syn]') as HTMLElement | null;
  if (!wordEl || !currentSettings) return;

  // Prevent link navigation (Wikipedia wraps words in <a> tags).
  e.preventDefault();
  e.stopPropagation();

  const lemma = wordEl.getAttribute('data-syn') ?? '';
  const surface = wordEl.dataset.surface ?? wordEl.textContent ?? '';
  const lexeme = currentLexemes[lemma] ?? null;
  const sentence = getSentenceForWord(wordEl);

  mountWordPopup({
    lemma,
    surface,
    sentence: sentence.trim(),
    anchorRect: wordEl.getBoundingClientRect(),
    lexeme,
    settings: currentSettings,
    onClose: dismissWordPopup,
    onStatusChange: handleStatusChange,
  });
}

// ─── Context menu (right-click on word span) ──────────────────────────────────

function handleContextMenu(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const wordEl = target.closest('span[data-syn]') as HTMLElement | null;
  if (!wordEl) return;

  const lemma = wordEl.getAttribute('data-syn') ?? '';
  const sentence = getSentenceForWord(wordEl);

  // We can't create a native context menu from content script.
  // Instead, open Advanced Creator directly (E shortcut behaviour).
  // Users expecting native context menu should use the chrome context menu set up in service-worker.
  // Right-click + Shift → open advanced creator
  if (e.shiftKey) {
    e.preventDefault();
    handleOpenAdvancedCreator(lemma, sentence.trim());
  }
}

// ─── Status change ────────────────────────────────────────────────────────────

function handleStatusChange(lemma: string, status: WordStatus) {
  const now = Date.now();
  if (currentLexemes[lemma]) {
    currentLexemes[lemma].status = status;
  } else {
    currentLexemes[lemma] = {
      key: lemma, lemma, surface: lemma, type: 'word',
      status, seenCount: 1, lastSeenAt: now, createdAt: now,
    };
  }
  updateWordStatus(lemma, status);
  if (isParsed && currentSettings?.showComprehensionHeader) refreshHeader();
}

// ─── Toggles ──────────────────────────────────────────────────────────────────

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
  sendMessage({ type: 'OPEN_OPTIONS_PAGE', payload: null }).catch(() => {
    chrome.runtime.openOptionsPage?.();
  });
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

function handleKeyDown(e: KeyboardEvent) {
  if (!currentSettings?.enabled) return;
  // Alt+A — toggle overlays (parse / remove)
  if (e.altKey && e.key === 'a') {
    e.preventDefault();
    if (isParsed) { removeOverlays(); isParsed = false; currentTokens = []; refreshHeader(); }
    else handleParse();
    return;
  }

  // Alt+T — toggle inline translations
  if (e.altKey && e.key === 't') {
    e.preventDefault();
    handleToggleTranslations(!currentSettings?.showInlineTranslations);
    return;
  }

  // Alt+S — dictionary lookup for selected text
  if (e.altKey && e.key === 's') {
    e.preventDefault();
    const sel = window.getSelection()?.toString().trim();
    if (sel) handleOpenAdvancedCreator(sel, '');
    return;
  }

  // E — send to advanced card creator
  if (e.key === 'e' || e.key === 'E') {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return;
    const sel = window.getSelection()?.toString().trim();
    if (sel) { handleOpenAdvancedCreator(sel, ''); return; }
  }

  // Escape — dismiss popup / creator
  if (e.key === 'Escape') {
    dismissWordPopup();
  }
}

// ─── Shift key: link mode ─────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'Shift' && !shiftMode) {
    shiftMode = true;
    document.body.classList.add('syn-shift-mode');
    if (isParsed) refreshHeader();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift' && shiftMode) {
    shiftMode = false;
    document.body.classList.remove('syn-shift-mode');
    if (isParsed) refreshHeader();
  }
});

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PARSE_PAGE') {
    if (currentSettings?.enabled) handleParse().catch(console.error);
    return;
  }

  if (msg.type === 'STATUS_CHANGED') {
    const { lemma, status } = msg.payload as { lemma: string; status: WordStatus };
    if (currentLexemes[lemma]) currentLexemes[lemma].status = status;
    if (isParsed) updateWordStatus(lemma, status);
  }

  if (msg.type === 'BULK_STATUS_CHANGED') {
    const { lemmas, status } = msg.payload as { lemmas: string[]; status: WordStatus };
    for (const lemma of lemmas) {
      if (currentLexemes[lemma]) currentLexemes[lemma].status = status;
      if (isParsed) updateWordStatus(lemma, status);
    }
  }

  if (msg.type === 'SETTINGS_UPDATED') {
    const patch = msg.payload as Partial<UserSettings>;
    const prevToken = currentSettings?.authToken ?? null;
    if (currentSettings) currentSettings = { ...currentSettings, ...patch };

    window.dispatchEvent(new CustomEvent('syntagma:settings-updated', { detail: patch }));

    if (patch.enabled === false) {
      removeOverlays();
      unmountHeaderBar();
      destroyVideoMode();
      dismissWordPopup();
      isParsed = false;
      currentTokens = [];
    }

    // Logout — tear down everything
    if ('authToken' in patch && !patch.authToken) {
      removeOverlays();
      unmountHeaderBar();
      destroyVideoMode();
      dismissWordPopup();
      isParsed = false;
      currentTokens = [];
    }

    // Login — prompt user to reload so init() runs cleanly from scratch
    if ('authToken' in patch && patch.authToken && !prevToken) {
      showReloadBanner();
    }

    if (patch.showLearningStatusColors !== undefined) applyStatusColors(patch.showLearningStatusColors);
    if (patch.showInlineTranslations !== undefined) applyInlineTranslations(patch.showInlineTranslations, currentLexemes);
  }

  if (msg.type === 'LOOKUP_WORD') {
    const { lemma } = msg.payload as { lemma: string };
    if (!lemma || !currentSettings) return;

    const wordEl = document.querySelector(`span[data-syn="${CSS.escape(lemma)}"]`) as HTMLElement | null;
    if (wordEl) {
      wordEl.click();
    } else {
      const fakeRect = {
        top: window.innerHeight / 2 - 150,
        bottom: window.innerHeight / 2 - 150,
        left: window.innerWidth / 2 - 170,
        right: window.innerWidth / 2 + 170,
        width: 340, height: 0,
        x: window.innerWidth / 2 - 170, y: window.innerHeight / 2 - 150,
        toJSON: () => ({}),
      } as DOMRect;
      mountWordPopup({
        lemma, surface: lemma, sentence: '',
        anchorRect: fakeRect, lexeme: currentLexemes[lemma] ?? null,
        settings: currentSettings,
        onClose: dismissWordPopup,
        onStatusChange: handleStatusChange,
      });
    }
  }
});

// ─── Reload banner ────────────────────────────────────────────────────────────

function showReloadBanner(): void {
  if (document.getElementById('syntagma-reload-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'syntagma-reload-banner';
  banner.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    'z-index:2147483647',
    'background:#1a1a2e',
    'color:#e0e0ff',
    'font-family:system-ui,sans-serif',
    'font-size:14px',
    'border-radius:12px',
    'padding:14px 18px',
    'box-shadow:0 4px 24px rgba(0,0,0,0.45)',
    'display:flex',
    'align-items:center',
    'gap:12px',
    'max-width:340px',
    'border:1px solid rgba(120,80,255,0.4)',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = 'Syntagma: Signed in — reload to activate on this page.';
  text.style.flex = '1';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload';
  reloadBtn.style.cssText = [
    'background:#7c3aed',
    'color:#fff',
    'border:none',
    'border-radius:7px',
    'padding:6px 14px',
    'cursor:pointer',
    'font-size:13px',
    'font-weight:600',
    'white-space:nowrap',
  ].join(';');
  reloadBtn.addEventListener('click', () => window.location.reload());

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = [
    'background:transparent',
    'color:#aaa',
    'border:none',
    'cursor:pointer',
    'font-size:18px',
    'line-height:1',
    'padding:0 4px',
  ].join(';');
  closeBtn.addEventListener('click', () => banner.remove());

  banner.appendChild(text);
  banner.appendChild(reloadBtn);
  banner.appendChild(closeBtn);
  document.documentElement.appendChild(banner);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

function isVideoPageUrl(url: string): boolean {
  return url.includes('youtube.com/watch') || url.includes('netflix.com/watch');
}

function getVideoIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    if (url.includes('youtube.com/watch')) return parsed.searchParams.get('v') ?? url;
    if (url.includes('netflix.com/watch')) return parsed.pathname;
  } catch { /* fall through */ }
  return url;
}

function reinitVideoMode() {
  if (!currentSettings || !currentSettings.enabled) return;
  destroyVideoMode();
  initVideoMode({
    settings: currentSettings,
    lexemes: currentLexemes,
    onStatusChange: handleStatusChange,
    onSettingsChange: (patch) => {
      if (currentSettings) currentSettings = { ...currentSettings, ...patch };
    },
  }).catch(console.error);
}

// ── SPA navigation detection (Netflix / YouTube navigate without full reload) ─
let lastHref = window.location.href;
const origPushState = history.pushState.bind(history);
const origReplaceState = history.replaceState.bind(history);

// Tracks the last video identity that was actually reinitialized, used to
// deduplicate between pushState interception and yt-navigate-finish.
let lastReinitIdentity = isVideoPageUrl(window.location.href)
  ? getVideoIdentity(window.location.href)
  : '';

function handleVideoNavigation(href: string, prevHref: string) {
  const hrefIsVideo = isVideoPageUrl(href);
  const prevIsVideo = isVideoPageUrl(prevHref);

  if (hrefIsVideo && !prevIsVideo) {
    // Non-video → video
    const id = getVideoIdentity(href);
    lastReinitIdentity = id;
    reinitVideoMode();
  } else if (!hrefIsVideo && prevIsVideo) {
    // Video → non-video
    lastReinitIdentity = '';
    destroyVideoMode();
  } else if (hrefIsVideo && prevIsVideo) {
    // Video → different video
    const id = getVideoIdentity(href);
    if (id !== lastReinitIdentity) {
      lastReinitIdentity = id;
      destroyVideoMode();
      reinitVideoMode();
    }
  }
}

function onUrlChange() {
  const href = window.location.href;
  if (href === lastHref) return;
  const prevHref = lastHref;
  lastHref = href;

  // For YouTube, pushState interception is unreliable: YouTube's router often
  // caches the original pushState reference before our content script runs,
  // bypassing our wrapper. yt-navigate-finish (below) handles YouTube instead.
  if (href.includes('youtube.com')) {
    // Still update lastHref but skip reinit — yt-navigate-finish will fire.
    // Only handle the "leaving YouTube entirely" case here.
    if (!isVideoPageUrl(href) && isVideoPageUrl(prevHref)) {
      lastReinitIdentity = '';
      destroyVideoMode();
    }
    return;
  }

  handleVideoNavigation(href, prevHref);
}

// YouTube fires yt-navigate-finish on document after its SPA navigation fully
// completes, including updating ytInitialPlayerResponse. This is the reliable
// trigger for YouTube video changes — unlike pushState which YouTube's router
// may bypass by caching the original reference before our content script runs.
document.addEventListener('yt-navigate-finish', () => {
  const href = window.location.href;
  if (!href.includes('youtube.com')) return;
  const prevHref = lastHref;
  lastHref = href;
  handleVideoNavigation(href, prevHref);
});

history.pushState = (...args: Parameters<typeof history.pushState>) => {
  origPushState(...args);
  onUrlChange();
};
history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
  origReplaceState(...args);
  onUrlChange();
};
window.addEventListener('popstate', onUrlChange);

if (window === window.top) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init().catch(console.error));
  } else {
    init().catch(console.error);
  }
}

export { handleParse as parsePage };
