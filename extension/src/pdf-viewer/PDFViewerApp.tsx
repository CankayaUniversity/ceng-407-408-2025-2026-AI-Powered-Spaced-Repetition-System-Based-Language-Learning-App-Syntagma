import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getSettings } from '../shared/storage';
import { sendMessage } from '../shared/messages';
import { initFrequencyTable } from '../shared/frequency';
import type { UserSettings, LexemeEntry, WordStatus, Token, FlashcardPayload } from '../shared/types';
import { parsePage } from '../content/parser';
import {
  injectOverlays,
  removeOverlays,
  updateWordStatus,
  applyStatusColors,
  applyInlineTranslations,
  injectStyles,
} from '../content/overlay';
import { mountHeaderBar, updateHeaderBar } from '../content/header-bar';
import { mountWordPopup, dismissWordPopup } from '../content/popup/WordPopup';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');

// Pre-compute asset directory URLs so getDocument() can load WASM decoders,
// CMap data, and standard fonts without warnings.
const WASM_URL = chrome.runtime.getURL('wasm/');
const CMAP_URL = chrome.runtime.getURL('cmaps/');
const STANDARD_FONT_URL = chrome.runtime.getURL('standard_fonts/');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPdfUrl(): string {
  const href = window.location.href;
  const idx = href.indexOf('?url=');
  if (idx === -1) return '';
  const raw = href.slice(idx + 5);
  try { return decodeURIComponent(raw); } catch { return raw; }
}

// Reconstruct readable paragraphs from raw PDF text content items.
// PDF Y-axis goes upward; items at the top of the page have larger Y values.
async function extractPageParagraphs(page: pdfjsLib.PDFPageProxy): Promise<string[]> {
  const tc = await page.getTextContent();

  type RawItem = { str: string; transform: number[]; hasEOL?: boolean };

  const items = (tc.items as RawItem[])
    .filter(it => it.str && it.str.trim() !== '')
    .map(it => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],   // keep full precision for better line grouping
      hasEOL: it.hasEOL ?? false,
    }));

  if (items.length === 0) return [];

  // Sort: largest Y first (top of page), then left-to-right
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  // Estimate typical line spacing from consecutive Y differences
  const yDiffs: number[] = [];
  for (let i = 1; i < items.length; i++) {
    const d = items[i - 1].y - items[i].y;
    if (d > 1 && d < 100) yDiffs.push(d);
  }
  yDiffs.sort((a, b) => a - b);
  const medianLineSpacing = yDiffs[Math.floor(yDiffs.length / 2)] ?? 14;

  // Items within half a line-height are on the same line
  const SAME_LINE = medianLineSpacing * 0.5;
  // A gap bigger than 1.8x line-height signals a new paragraph
  const PARA_BREAK = medianLineSpacing * 1.8;

  // Group items into lines
  const lines: { y: number; parts: string[] }[] = [];
  for (const it of items) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.y - last.y) <= SAME_LINE) {
      last.parts.push(it.str);
    } else {
      lines.push({ y: it.y, parts: [it.str] });
    }
  }

  // Merge lines into paragraphs
  const paragraphs: string[] = [];
  let current = '';
  let prevY: number | null = null;

  for (const line of lines) {
    const lineText = line.parts.join(' ').trim();
    if (!lineText) continue;

    const gap = prevY !== null ? prevY - line.y : 0;
    if (prevY !== null && gap > PARA_BREAK) {
      if (current.trim()) { paragraphs.push(current.trim()); current = ''; }
    }

    // Add a space between lines unless previous line ended with a hyphen (word-wrap)
    if (current) {
      current = current.endsWith('-') ? current.slice(0, -1) + lineText : current + ' ' + lineText;
    } else {
      current = lineText;
    }
    prevY = line.y;
  }
  if (current.trim()) paragraphs.push(current.trim());

  return paragraphs;
}

function getSentenceForWord(wordEl: HTMLElement): string {
  const block = wordEl.closest('p, .pdf-para') as HTMLElement | null ?? wordEl.parentElement as HTMLElement;
  const surface = wordEl.dataset.surface ?? wordEl.textContent?.trim() ?? '';
  const blockText = block?.textContent ?? '';

  let offset = 0;
  let wordOffset = -1;
  const walker = document.createTreeWalker(block ?? document.body, NodeFilter.SHOW_TEXT);
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
  if (wordOffset < 0) return surface;

  const starts = [0];
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

// ─── Component ────────────────────────────────────────────────────────────────

const BATCH = 6; // pages per rendering chunk

export default function PDFViewerApp() {
  const pdfUrl = getPdfUrl();

  const [status, setStatus] = useState<'loading' | 'rendering' | 'done' | 'error'>('loading');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<UserSettings | null>(null);
  const lexemesRef = useRef<Record<string, LexemeEntry>>({});
  const tokensRef = useRef<Token[]>([]);
  const isParsedRef = useRef(false);
  const isParsingRef = useRef(false);
  const headerMountedRef = useRef(false);

  // ── Syntagma init ──────────────────────────────────────────────────────────
  useEffect(() => {
    injectStyles();
    (async () => {
      const [settings] = await Promise.all([getSettings(), initFrequencyTable()]);
      settingsRef.current = settings;
      if (!settings.authToken) return;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await sendMessage<{ lexemes: Record<string, LexemeEntry> }>({
            type: 'PARSE_PAGE_FOR_COMPREHENSION',
            payload: { tabId: 0, pageUrl: pdfUrl },
          });
          lexemesRef.current = res?.lexemes ?? {};
          break;
        } catch {
          if (attempt === 0) await new Promise(r => setTimeout(r, 500));
        }
      }
    })().catch(console.error);
  }, [pdfUrl]);

  // ── Syntagma parse + header ────────────────────────────────────────────────
  const runParse = useCallback(async () => {
    // Wait for settings to load (up to 3 seconds)
    for (let i = 0; i < 30 && !settingsRef.current; i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (!settingsRef.current?.enabled) return;
    if (isParsingRef.current) return;
    isParsingRef.current = true;

    try {
      if (isParsedRef.current) removeOverlays();
      const result = await parsePage(lexemesRef.current, () => {});
      tokensRef.current = result.tokens;
      injectOverlays(result, lexemesRef.current);
      isParsedRef.current = true;
      applyStatusColors(settingsRef.current.showLearningStatusColors);
      if (settingsRef.current.showInlineTranslations) applyInlineTranslations(true, lexemesRef.current);
    } catch (err) {
      console.error('[Syntagma PDF] parse error:', err);
    } finally {
      isParsingRef.current = false;
    }

    const s = settingsRef.current!;
    const headerState = {
      settings: s,
      tokens: tokensRef.current,
      lexemes: lexemesRef.current,
      isParsing: false,
      shiftMode: false,
      onParse: runParse,
      onToggleColors: (v: boolean) => {
        if (settingsRef.current) settingsRef.current = { ...settingsRef.current, showLearningStatusColors: v };
        applyStatusColors(v);
        sendMessage({ type: 'SET_SETTINGS', payload: { showLearningStatusColors: v } }).catch(console.error);
      },
      onToggleTranslations: (v: boolean) => {
        if (settingsRef.current) settingsRef.current = { ...settingsRef.current, showInlineTranslations: v };
        applyInlineTranslations(v, lexemesRef.current);
        sendMessage({ type: 'SET_SETTINGS', payload: { showInlineTranslations: v } }).catch(console.error);
      },
      onOpenSettings: () => {
        sendMessage({ type: 'OPEN_OPTIONS_PAGE', payload: null }).catch(() => chrome.runtime.openOptionsPage?.());
      },
      onQuickAddCard: async (lemma: string, sentence: string) => {
        if (!settingsRef.current) throw new Error('not ready');
        const card: FlashcardPayload = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          lemma, surfaceForm: lemma, sentence,
          sourceUrl: pdfUrl, sourceTitle: document.title,
          trMeaning: lexemesRef.current[lemma]?.trMeaning ?? '',
          createdAt: Date.now(),
          deckName: settingsRef.current.ankiDeckName,
          tags: ['syntagma', 'pdf'],
        };
        await sendMessage({ type: 'CREATE_FLASHCARD', payload: card });
      },
      onOpenAdvancedCreator: (lemma?: string, sentence?: string) => {
        dismissWordPopup();
        sendMessage({ type: 'OPEN_CARD_CREATOR', payload: { word: lemma ?? '', sentence: sentence ?? '', sourceUrl: pdfUrl, sourceTitle: document.title } }).catch(console.error);
      },
    };

    if (headerMountedRef.current) {
      updateHeaderBar(headerState);
    } else {
      mountHeaderBar(headerState);
      headerMountedRef.current = true;
    }
  }, [pdfUrl]);

  // ── Load + render PDF ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfUrl) { setErrorMsg('No PDF URL in the address bar.'); setStatus('error'); return; }

    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument({
      url: pdfUrl,
      wasmUrl: WASM_URL,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
      standardFontDataUrl: STANDARD_FONT_URL,
    });

    loadingTask.promise.then(async (doc: PDFDocumentProxy) => {
      if (cancelled) return;
      setProgress({ done: 0, total: doc.numPages });
      setStatus('rendering');
      document.title = `PDF – ${decodeURIComponent(pdfUrl.split('/').pop()?.split('?')[0] ?? 'document')}`;

      const container = containerRef.current;
      if (!container) return;
      container.innerHTML = '';

      for (let p = 1; p <= doc.numPages; p++) {
        if (cancelled) break;

        const page = await doc.getPage(p);
        const paragraphs = await extractPageParagraphs(page);
        page.cleanup();

        if (cancelled) break;

        const section = document.createElement('section');
        section.className = 'pdf-page-section';

        const label = document.createElement('div');
        label.className = 'pdf-page-label';
        label.textContent = `Page ${p}`;
        section.appendChild(label);

        if (paragraphs.length === 0) {
          const empty = document.createElement('p');
          empty.className = 'pdf-para pdf-para--empty';
          empty.textContent = '(no selectable text on this page)';
          section.appendChild(empty);
        } else {
          for (const para of paragraphs) {
            if (!para.trim()) continue;
            const pEl = document.createElement('p');
            pEl.className = 'pdf-para';
            pEl.textContent = para;
            section.appendChild(pEl);
          }
        }

        container.appendChild(section);
        setProgress(prev => ({ ...prev, done: p }));

        // Parse incrementally after each batch
        if (p % BATCH === 0 || p === doc.numPages) {
          if (!cancelled) {
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            await runParse();
          }
        }
      }

      if (!cancelled) {
        setStatus('done');
        // Final parse pass after all pages are in the DOM
        await runParse();
      }
    }).catch((err: Error) => {
      if (!cancelled) {
        console.error('[Syntagma PDF] load error:', err);
        setErrorMsg(`Could not load PDF: ${err.message}`);
        setStatus('error');
      }
    });

    return () => {
      cancelled = true;
      loadingTask.destroy().catch(() => {});
    };
  }, [pdfUrl, runParse]);

  // ── Word click ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const wordEl = (e.target as HTMLElement).closest('span[data-syn]') as HTMLElement | null;
      if (!wordEl || !settingsRef.current) return;
      e.preventDefault(); e.stopPropagation();
      const lemma = wordEl.getAttribute('data-syn') ?? '';
      const surface = wordEl.dataset.surface ?? wordEl.textContent ?? '';
      mountWordPopup({
        lemma, surface,
        sentence: getSentenceForWord(wordEl).trim(),
        anchorRect: wordEl.getBoundingClientRect(),
        lexeme: lexemesRef.current[lemma] ?? null,
        settings: settingsRef.current,
        onClose: dismissWordPopup,
        onStatusChange: (l: string, s: WordStatus) => {
          const now = Date.now();
          lexemesRef.current[l] = lexemesRef.current[l]
            ? { ...lexemesRef.current[l], status: s }
            : { key: l, lemma: l, surface: l, type: 'word', status: s, seenCount: 1, lastSeenAt: now, createdAt: now };
          updateWordStatus(l, s);
        },
      });
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  // ── Keyboard + message handling ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissWordPopup(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const handler = (msg: { type: string; payload: unknown }) => {
      if (msg.type === 'STATUS_CHANGED') {
        const { lemma, status: s } = msg.payload as { lemma: string; status: WordStatus };
        if (lexemesRef.current[lemma]) lexemesRef.current[lemma].status = s;
        if (isParsedRef.current) updateWordStatus(lemma, s);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        body { margin: 0; background: #3a3a3a; font-family: Georgia, 'Times New Roman', serif; }
        .pdf-scroll { padding: 56px 20px 60px; }
        .pdf-page-section {
          background: #fff;
          max-width: 720px;
          margin: 0 auto 24px;
          padding: 48px 56px;
          border-radius: 2px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.4);
          line-height: 1.7;
          color: #111;
        }
        .pdf-page-label {
          font-size: 11px;
          font-family: system-ui, sans-serif;
          color: #999;
          text-align: right;
          margin-bottom: 16px;
          letter-spacing: .05em;
          text-transform: uppercase;
        }
        .pdf-para {
          margin: 0 0 1em;
          font-size: 15px;
          text-align: justify;
          hyphens: auto;
        }
        .pdf-para--empty { color: #aaa; font-style: italic; font-size: 13px; }
        .pdf-loading {
          position: fixed; top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(245,241,233,0.97);
          border: 1px solid #E2DACE;
          border-radius: 10px;
          padding: 20px 32px;
          font-family: system-ui, sans-serif;
          font-size: 14px;
          color: #4A3B2C;
          z-index: 9999;
          box-shadow: 0 4px 24px rgba(0,0,0,0.5);
          text-align: center;
          min-width: 240px;
        }
        .pdf-loading-bar {
          height: 4px;
          background: #E2DACE;
          border-radius: 2px;
          margin-top: 10px;
          overflow: hidden;
        }
        .pdf-loading-fill {
          height: 100%;
          background: #A07855;
          border-radius: 2px;
          transition: width .3s;
        }
        .pdf-error {
          background: #D97762;
          color: #fff;
          padding: 14px 24px;
          border-radius: 8px;
          margin: 60px auto;
          max-width: 600px;
          font-family: system-ui, sans-serif;
          font-size: 14px;
          text-align: center;
        }
      `}</style>

      <div className="pdf-scroll">
        {status === 'error' && (
          <div className="pdf-error">{errorMsg || 'Failed to load PDF.'}</div>
        )}
        {(status === 'loading' || status === 'rendering') && (
          <div className="pdf-loading">
            <div style={{ fontWeight: 600 }}>
              {status === 'loading' ? 'Opening PDF…' : `Extracting text… ${progress.done} / ${progress.total}`}
            </div>
            {progress.total > 0 && (
              <div className="pdf-loading-bar">
                <div
                  className="pdf-loading-fill"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
        <div ref={containerRef} />
      </div>
    </>
  );
}
