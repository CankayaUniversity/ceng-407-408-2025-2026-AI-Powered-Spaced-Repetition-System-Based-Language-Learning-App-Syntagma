import type { WordStatus, LexemeEntry } from '../shared/types';
import type { ParseResult } from './parser';

const SYNTAGMA_STYLE_ID = 'syntagma-styles';

// Use a regular span with a data attribute — more reliably styled than custom elements
const TAG = 'span';
const ATTR = 'data-syn';

const BASE_CSS = `
/* CSS variables scoped to all Syntagma containers */
[data-syntagma] {
  --syn-base:     #F5F1E9;
  --syn-surface0: #FFFFFF;
  --syn-surface1: #E2DACE;
  --syn-surface2: #C9BEAD;
  --syn-text:     #4A3B2C;
  --syn-subtext:  #877666;
  --syn-blue:     #98C1D9;
  --syn-red:      #D97762;
  --syn-amber:    #A07855;
  --syn-green:    #A8B693;
  --syn-overlay:  rgba(245, 241, 233, 0.95);
}

span[data-syn] {
  display: inline !important;
  cursor: pointer !important;
  font-family: inherit !important;
  font-size: inherit !important;
  color: inherit !important;
  line-height: inherit !important;
  background-color: transparent !important;
  vertical-align: baseline !important;
  border-bottom: 2px solid transparent !important;
  transition: background-color 0.1s, border-color 0.1s !important;
}
span[data-syn]:hover {
  background-color: rgba(160,120,85,0.15) !important;
}

span.syn-sentence {
  display: inline !important;
  border-radius: 3px !important;
  transition: background-color 0.15s !important;
}
span.syn-sentence.syn-sent-hover {
  background-color: rgba(160, 120, 85, 0.1) !important;
}

/* Unknown — red underline */
span[data-syn].syn-unknown {
  border-bottom: 2px solid #D97762 !important;
}

/* Learning — amber underline */
span[data-syn].syn-learning {
  border-bottom: 2px solid #A07855 !important;
}

/* Known — no underline */
span[data-syn].syn-known {
  border-bottom: 2px solid transparent !important;
}

/* Ignored — faded */
span[data-syn].syn-ignored {
  opacity: 0.4 !important;
  border-bottom: 2px solid transparent !important;
}

/* Inline Turkish translation */
span[data-syn] .syn-tr {
  display: none !important;
  font-size: 0.7em !important;
  color: #98C1D9 !important;
  margin-left: 2px !important;
  font-style: italic !important;
  vertical-align: super !important;
  pointer-events: none !important;
}
span[data-syn].syn-show-tr .syn-tr {
  display: inline !important;
}

/* Colors disabled */
body.syn-no-colors span[data-syn].syn-unknown,
body.syn-no-colors span[data-syn].syn-learning {
  border-bottom: 2px solid transparent !important;
}

/* Shift mode: disable pointer events so underlying links are clickable */
body.syn-shift-mode span[data-syn] {
  pointer-events: none !important;
  cursor: auto !important;
  border-bottom: 2px solid transparent !important;
}
`;

export function injectStyles(): void {
  if (document.getElementById(SYNTAGMA_STYLE_ID)) return;
  try {
    const style = document.createElement('style');
    style.id = SYNTAGMA_STYLE_ID;
    style.textContent = BASE_CSS;
    (document.head ?? document.documentElement).appendChild(style);
    console.log('[Syntagma] Styles injected');
  } catch (e) {
    console.error('[Syntagma] Style inject failed:', e);
  }
}

function removeStylesEl(): void {
  document.getElementById(SYNTAGMA_STYLE_ID)?.remove();
}

function getStatusClass(status: WordStatus): string {
  switch (status) {
    case 'unknown':  return 'syn-unknown';
    case 'learning': return 'syn-learning';
    case 'known':    return 'syn-known';
    case 'ignored':  return 'syn-ignored';
  }
}

function getSentenceBoundaries(text: string): Array<{ start: number; end: number }> {
  const boundaries: Array<{ start: number; end: number }> = [];
  const re = /[.!?]+\s+/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (end > start) boundaries.push({ start, end });
    start = end;
  }
  if (start < text.length) boundaries.push({ start, end: text.length });
  return boundaries.length > 0 ? boundaries : [{ start: 0, end: text.length }];
}

function makeWordSpan(token: { lemma: string; surface: string; startOffset?: number; endOffset?: number; status?: WordStatus }, text: string, lexemes: Record<string, LexemeEntry>): HTMLElement {
  const start = token.startOffset ?? 0;
  const end = token.endOffset ?? (start + token.surface.length);
  const span = document.createElement(TAG);
  span.setAttribute(ATTR, token.lemma);
  span.setAttribute('data-surface', token.surface);
  span.textContent = text.slice(start, end);
  const status = lexemes[token.lemma]?.status ?? token.status ?? 'unknown';
  span.className = getStatusClass(status);
  const trMeaning = lexemes[token.lemma]?.trMeaning;
  if (trMeaning) {
    const tr = document.createElement('span');
    tr.className = 'syn-tr';
    tr.textContent = trMeaning;
    span.appendChild(tr);
  }
  return span;
}

export function injectOverlays(parseResult: ParseResult, lexemes: Record<string, LexemeEntry>): void {
  injectStyles();

  let injected = 0;

  for (const { node, tokens } of parseResult.textNodes) {
    if (!node.parentNode) continue;

    const parentEl = node.parentElement;
    if (parentEl && parentEl.hasAttribute(ATTR)) continue;

    const text = node.textContent ?? '';
    if (!text || tokens.length === 0) continue;

    const sorted = [...tokens].sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
    const boundaries = getSentenceBoundaries(text);
    const fragment = document.createDocumentFragment();

    for (const boundary of boundaries) {
      const sentTokens = sorted.filter(t => {
        const ts = t.startOffset ?? 0;
        const te = t.endOffset ?? (ts + t.surface.length);
        return ts >= boundary.start && te <= boundary.end;
      });

      if (sentTokens.length === 0) {
        fragment.appendChild(document.createTextNode(text.slice(boundary.start, boundary.end)));
        continue;
      }

      const sentSpan = document.createElement('span');
      sentSpan.className = 'syn-sentence';

      let lastOffset = boundary.start;
      for (const token of sentTokens) {
        const start = token.startOffset ?? 0;
        const end = token.endOffset ?? (start + token.surface.length);

        if (start > lastOffset) {
          sentSpan.appendChild(document.createTextNode(text.slice(lastOffset, start)));
        }

        sentSpan.appendChild(makeWordSpan(token, text, lexemes));
        lastOffset = end;
        injected++;
      }

      if (lastOffset < boundary.end) {
        sentSpan.appendChild(document.createTextNode(text.slice(lastOffset, boundary.end)));
      }

      fragment.appendChild(sentSpan);
    }

    try {
      node.parentNode.replaceChild(fragment, node);
    } catch (e) {
      console.warn('[Syntagma] replaceChild failed:', e);
    }
  }

  console.log(`[Syntagma] Injected ${injected} word spans across ${parseResult.textNodes.length} text nodes`);
  initSentenceHighlight();
}

export function removeOverlays(): void {
  // Unwrap word spans first
  const spans = document.querySelectorAll(`span[${ATTR}]`);
  for (const span of spans) {
    const parent = span.parentNode;
    if (!parent) continue;
    const text = (span as HTMLElement).dataset.surface ?? span.textContent ?? '';
    parent.replaceChild(document.createTextNode(text), span);
  }
  // Unwrap sentence spans
  const sentSpans = document.querySelectorAll('span.syn-sentence');
  for (const span of sentSpans) {
    const parent = span.parentNode;
    if (!parent) continue;
    const frag = document.createDocumentFragment();
    while (span.firstChild) frag.appendChild(span.firstChild);
    parent.replaceChild(frag, span);
  }
  document.body.normalize();
  removeStylesEl();
  console.log('[Syntagma] Overlays removed');
}

export function updateWordStatus(lemma: string, status: WordStatus): void {
  const spans = document.querySelectorAll(`span[${ATTR}="${CSS.escape(lemma)}"]`);
  for (const span of spans) {
    span.className = span.className.replace(/syn-\w+/g, '').trim();
    span.classList.add(getStatusClass(status));
    if (status === 'known' || status === 'ignored') {
      span.querySelector('.syn-tr')?.remove();
    }
  }
}

export function applyStatusColors(enabled: boolean): void {
  if (enabled) {
    document.body.classList.remove('syn-no-colors');
  } else {
    document.body.classList.add('syn-no-colors');
  }
}

export function applyInlineTranslations(enabled: boolean, lexemes: Record<string, LexemeEntry>): void {
  const spans = document.querySelectorAll(`span[${ATTR}]`);
  for (const span of spans) {
    const lemma = (span as HTMLElement).getAttribute(ATTR) ?? '';
    const lexeme = lexemes[lemma];

    span.querySelector('.syn-tr')?.remove();
    span.classList.remove('syn-show-tr');

    if (enabled && lexeme?.trMeaning && lexeme.status !== 'known' && lexeme.status !== 'ignored') {
      const tr = document.createElement('span');
      tr.className = 'syn-tr';
      tr.textContent = lexeme.trMeaning;
      span.appendChild(tr);
      span.classList.add('syn-show-tr');
    }
  }
}

// ─── Sentence hover highlight ─────────────────────────────────────────────────

const INLINE_TAGS = new Set(['SPAN', 'A', 'B', 'I', 'EM', 'STRONG', 'U', 'S', 'MARK', 'SMALL', 'SUB', 'SUP', 'CODE', 'ABBR', 'CITE', 'Q']);

function findBlockRoot(wordEl: HTMLElement): HTMLElement | null {
  let block = wordEl.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th') as HTMLElement | null;
  if (!block) {
    let el: HTMLElement | null = wordEl.parentElement;
    while (el && el !== document.body) {
      if (!INLINE_TAGS.has(el.tagName)) { block = el; break; }
      el = el.parentElement;
    }
  }
  return block;
}

function getSentenceSpans(wordEl: HTMLElement): HTMLElement[] {
  const block = findBlockRoot(wordEl);
  if (!block) {
    const s = wordEl.closest('span.syn-sentence') as HTMLElement | null;
    return s ? [s] : [];
  }

  const surface = (wordEl as HTMLElement).dataset.surface ?? wordEl.textContent?.trim() ?? '';
  const blockText = block.textContent ?? '';

  // Find word offset within block text
  let offset = 0;
  let wordOffset = -1;
  const w1 = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = w1.nextNode())) {
    if (wordEl.contains(node as Node)) {
      wordOffset = offset + Math.max(0, (node.textContent ?? '').indexOf(surface));
      break;
    }
    offset += (node.textContent ?? '').length;
  }
  if (wordOffset < 0) {
    const s = wordEl.closest('span.syn-sentence') as HTMLElement | null;
    return s ? [s] : [];
  }

  // Get sentence range
  const starts: number[] = [0];
  const re = /[.!?]+\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blockText)) !== null) starts.push(m.index + m[0].length);
  starts.push(blockText.length);

  let sentStart = 0, sentEnd = blockText.length;
  for (let i = 0; i < starts.length - 1; i++) {
    if (wordOffset >= starts[i] && wordOffset < starts[i + 1]) {
      sentStart = starts[i]; sentEnd = starts[i + 1]; break;
    }
  }

  // Collect all syn-sentence spans whose text overlaps the sentence range
  const result: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  let charOffset = 0;
  const w2 = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  while ((node = w2.nextNode())) {
    const len = (node.textContent ?? '').length;
    if (charOffset + len > sentStart && charOffset < sentEnd) {
      const sentSpan = (node.parentElement as HTMLElement | null)?.closest('span.syn-sentence') as HTMLElement | null;
      if (sentSpan && !seen.has(sentSpan)) {
        seen.add(sentSpan);
        result.push(sentSpan);
      }
    }
    charOffset += len;
  }
  return result;
}

let sentHighlightInit = false;

export function initSentenceHighlight(): void {
  if (sentHighlightInit) return;
  sentHighlightInit = true;

  let currentSpans: HTMLElement[] = [];

  document.addEventListener('mouseover', (e) => {
    const wordEl = (e.target as HTMLElement).closest('span[data-syn]') as HTMLElement | null;

    // If still inside the same highlighted sentence, skip recompute
    if (wordEl && currentSpans.length > 0 && currentSpans.some(s => s.contains(wordEl))) return;

    for (const s of currentSpans) s.classList.remove('syn-sent-hover');
    currentSpans = [];

    if (!wordEl) return;

    currentSpans = getSentenceSpans(wordEl);
    for (const s of currentSpans) s.classList.add('syn-sent-hover');
  });
}

export function countByStatus(lexemes: Record<string, LexemeEntry>): {
  total: number; known: number; learning: number; unknown: number; ignored: number;
  uniqueKnown: number; uniqueLearning: number; uniqueUnknown: number;
} {
  const spans = document.querySelectorAll(`span[${ATTR}]`);
  let known = 0, learning = 0, unknown = 0, ignored = 0;
  let uniqueKnown = 0, uniqueLearning = 0, uniqueUnknown = 0;
  const seen = new Set<string>();

  for (const span of spans) {
    const lemma = (span as HTMLElement).getAttribute(ATTR) ?? '';
    const status = lexemes[lemma]?.status ?? 'unknown';
    if (status === 'known')         known++;
    else if (status === 'learning') learning++;
    else if (status === 'ignored')  ignored++;
    else                            unknown++;

    if (!seen.has(lemma)) {
      seen.add(lemma);
      if (status === 'known')         uniqueKnown++;
      else if (status === 'learning') uniqueLearning++;
      else if (status !== 'ignored')  uniqueUnknown++;
    }
  }

  return { total: spans.length, known, learning, unknown, ignored, uniqueKnown, uniqueLearning, uniqueUnknown };
}
