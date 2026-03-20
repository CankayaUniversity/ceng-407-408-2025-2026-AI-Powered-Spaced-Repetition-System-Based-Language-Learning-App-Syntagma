import type { WordStatus, LexemeEntry } from '../shared/types';
import type { ParseResult } from './parser';

const SYNTAGMA_STYLE_ID = 'syntagma-styles';

// Use a regular span with a data attribute — more reliably styled than custom elements
const TAG = 'span';
const ATTR = 'data-syn';

const BASE_CSS = `
span[data-syn] {
  display: inline !important;
  cursor: pointer !important;
  border-radius: 1px !important;
  font-family: inherit !important;
  font-size: inherit !important;
  color: inherit !important;
  line-height: inherit !important;
  transition: background-color 0.1s !important;
  background-color: transparent !important;
  vertical-align: baseline !important;
}
span[data-syn]:hover {
  background-color: rgba(160,120,85,0.18) !important;
}

/* Unknown — red/pink underline */
span[data-syn].syn-unknown {
  border-bottom: 2px solid #D97762 !important;
  text-decoration-line: underline !important;
  text-decoration-color: #D97762 !important;
  text-decoration-thickness: 2px !important;
}

/* Learning — amber underline */
span[data-syn].syn-learning {
  border-bottom: 2px solid #A07855 !important;
  text-decoration-line: underline !important;
  text-decoration-color: #A07855 !important;
  text-decoration-thickness: 2px !important;
}

/* Known — no underline */
span[data-syn].syn-known {
  border-bottom: none !important;
  text-decoration: none !important;
}

/* Ignored — faded, no underline */
span[data-syn].syn-ignored {
  opacity: 0.45 !important;
  border-bottom: none !important;
  text-decoration: none !important;
}

/* Inline Turkish translation */
span[data-syn] .syn-tr {
  display: none !important;
  font-size: 0.72em !important;
  color: #98C1D9 !important;
  margin-left: 2px !important;
  font-style: italic !important;
  vertical-align: super !important;
  pointer-events: none !important;
}
span[data-syn].syn-show-tr .syn-tr {
  display: inline !important;
}

/* When colors are disabled */
body.syn-no-colors span[data-syn].syn-unknown,
body.syn-no-colors span[data-syn].syn-learning {
  border-bottom: none !important;
  text-decoration: none !important;
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

export function injectOverlays(parseResult: ParseResult, lexemes: Record<string, LexemeEntry>): void {
  injectStyles();

  let injected = 0;

  for (const { node, tokens } of parseResult.textNodes) {
    if (!node.parentNode) continue;

    // Don't re-wrap already-wrapped nodes
    const parentEl = node.parentElement;
    if (parentEl && parentEl.hasAttribute(ATTR)) continue;

    const text = node.textContent ?? '';
    if (!text || tokens.length === 0) continue;

    const fragment = document.createDocumentFragment();
    let lastOffset = 0;

    const sorted = [...tokens].sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));

    for (const token of sorted) {
      const start = token.startOffset ?? 0;
      const end   = token.endOffset ?? (start + token.surface.length);

      // Text before this word
      if (start > lastOffset) {
        fragment.appendChild(document.createTextNode(text.slice(lastOffset, start)));
      }

      // Word span
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

      fragment.appendChild(span);
      lastOffset = end;
      injected++;
    }

    // Remaining text
    if (lastOffset < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastOffset)));
    }

    try {
      node.parentNode.replaceChild(fragment, node);
    } catch (e) {
      console.warn('[Syntagma] replaceChild failed:', e);
    }
  }

  console.log(`[Syntagma] Injected ${injected} word spans across ${parseResult.textNodes.length} text nodes`);
}

export function removeOverlays(): void {
  const spans = document.querySelectorAll(`span[${ATTR}]`);
  for (const span of spans) {
    const parent = span.parentNode;
    if (!parent) continue;
    const text = (span as HTMLElement).dataset.surface ?? span.textContent ?? '';
    parent.replaceChild(document.createTextNode(text), span);
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

export function countByStatus(lexemes: Record<string, LexemeEntry>): {
  total: number; known: number; learning: number; unknown: number; ignored: number;
} {
  const spans = document.querySelectorAll(`span[${ATTR}]`);
  let known = 0, learning = 0, unknown = 0, ignored = 0;

  for (const span of spans) {
    const lemma = (span as HTMLElement).getAttribute(ATTR) ?? '';
    const status = lexemes[lemma]?.status ?? 'unknown';
    if (status === 'known')        known++;
    else if (status === 'learning') learning++;
    else if (status === 'ignored')  ignored++;
    else                            unknown++;
  }

  return { total: spans.length, known, learning, unknown, ignored };
}
