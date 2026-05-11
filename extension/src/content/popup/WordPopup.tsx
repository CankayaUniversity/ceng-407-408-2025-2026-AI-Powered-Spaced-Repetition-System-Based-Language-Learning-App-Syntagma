import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import type { WordStatus, LexemeEntry, UserSettings } from '../../shared/types';
import { sendMessage } from '../../shared/messages';
import type { AiResultData } from '../../shared/backend-ai';
import { lookupFrequency, getFrequencyBand } from '../../shared/frequency';
import { StatusRow } from './StatusRow';
import { PopupButtons } from './PopupButtons';

const C = {
  base: '#F5F1E9',
  surface0: '#FFFFFF',
  surface1: '#E2DACE',
  surface2: '#C9BEAD',
  text: '#4A3B2C',
  subtext: '#877666',
  blue: '#98C1D9',
  red: '#D97762',
  amber: '#A07855',
  green: '#A8B693',
  mauve: '#A07855',
  overlay: 'rgba(245, 241, 233, 0.97)',
};

type AIActionType = 'explain-word' | 'explain-sentence' | 'translate';

interface WordPopupProps {
  lemma: string;
  surface: string;
  sentence: string;
  anchorRect: DOMRect;
  lexeme: LexemeEntry | null;
  settings: UserSettings;
  screenshotDataUrl?: string;
  // Full speech range covering `sentence` (may span multiple cues).
  // Used so the audio recorder captures the whole sentence, not just
  // the cue that happens to be on screen.
  sentenceStartMs?: number;
  sentenceEndMs?: number;
  onClose: () => void;
  onStatusChange: (lemma: string, status: WordStatus) => void;
}

function FreqBadge({ rank }: { rank?: number }) {
  if (!rank) return null;
  const band = getFrequencyBand(rank);
  const colors: Record<string, string> = {
    'very-common': C.green,
    'common': C.blue,
    'medium': C.amber,
    'rare': C.subtext,
  };
  return (
    <span style={{
      background: C.surface1,
      color: colors[band] ?? C.subtext,
      borderRadius: '3px',
      padding: '1px 5px',
      fontSize: '10px',
      fontWeight: 600,
    }}>
      #{rank}
    </span>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: C.subtext, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{ color: C.text }}>{value}</div>
    </div>
  );
}

function AIPanel({ result, loading, error }: { result: AiResultData | null; loading: boolean; error?: string | null }) {
  if (!result && !loading && !error) return null;

  const wrap: React.CSSProperties = {
    background: C.surface0,
    borderRadius: '6px',
    padding: '10px 12px',
    marginBottom: '8px',
    fontSize: '12px',
    color: C.text,
    lineHeight: 1.55,
    maxHeight: '260px',
    overflowY: 'auto',
  };

  if (error) {
    return <div style={wrap}><span style={{ color: C.red }}>{error}</span></div>;
  }

  if (loading && !result) {
    return <div style={wrap}><span style={{ color: C.subtext }}>Thinking…</span></div>;
  }

  if (!result) return null;

  if (result.kind === 'explain-word') {
    const d = result.data;
    return (
      <div style={wrap}>
        <Field label="Meaning" value={d.meaning} />
        <Field label="Part of Speech" value={d.partOfSpeech} />
        <Field label="Usage Note" value={d.usageNote} />
        <Field label="Common Mistake" value={d.commonMistake} />
        {d.examples?.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: C.subtext, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
              Examples
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px' }}>
              {d.examples.map((ex, i) => <li key={i} style={{ marginBottom: '2px' }}>{ex}</li>)}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (result.kind === 'translate') {
    const d = result.data;
    return (
      <div style={wrap}>
        <Field label="Natural" value={d.naturalTranslation} />
        <Field label="Literal" value={d.literalTranslation} />
        <Field label="Alternative" value={d.alternativeTranslation} />
      </div>
    );
  }

  // explain-sentence
  const d = result.data;
  return (
    <div style={wrap}>
      {d.parts?.length > 0 && (
        <div style={{ marginBottom: '6px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: C.subtext, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
            Parts
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            {d.parts.map((p, i) => (
              <li key={i} style={{ marginBottom: '2px' }}>
                <span style={{ fontWeight: 600 }}>{p.chunk}</span>
                <span style={{ color: C.subtext }}> — {p.function}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Field label="Turkish Meaning" value={d.turkishMeaning} />
      <Field label="Grammar" value={d.grammarStructure} />
      <Field label="Why This Structure" value={d.whyThisStructure} />
      <Field label="Learner Tip" value={d.learnerTip} />
    </div>
  );
}

function WordPopupInner({
  lemma,
  surface,
  sentence,
  anchorRect,
  lexeme,
  settings,
  screenshotDataUrl,
  sentenceStartMs,
  sentenceEndMs,
  onClose,
  onStatusChange,
}: WordPopupProps) {
  const [currentStatus, setCurrentStatus] = useState<WordStatus>(lexeme?.status ?? 'unknown');
  const [aiResult, setAiResult] = useState<AiResultData | null>(null);
  const [aiLoading, setAiLoading] = useState<AIActionType | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [cardSaved, setCardSaved] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [screenshot] = useState<string | null>(screenshotDataUrl ?? null);
  const [isDragging, setIsDragging] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const freqEntry = lookupFrequency(lemma);

  // Fetch dictionary translations from Background IndexedDB
  const [translations, setTranslations] = useState<string[]>([]);

  useEffect(() => {
    sendMessage<{ translations: string[] }>({
      type: 'LOOKUP_DICTIONARY',
      payload: { word: lemma },
    }).then(res => {
      if (res && res.translations) {
        setTranslations(res.translations);
      }
    }).catch(console.error);
  }, [lemma]);

  // Calculate position — anchorRect is always in viewport space (from getBoundingClientRect).
  // The popup is position:fixed so top/left are also viewport-relative; no scroll offset needed.
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;

    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const popupH = popup.offsetHeight || 300;
    const popupW = popup.offsetWidth || 340;

    // Default: open below the word
    let top = anchorRect.bottom + 6;
    let left = anchorRect.left;

    // Flip above if popup would overflow the bottom of the viewport
    if (top + popupH + 20 > viewportH) {
      top = anchorRect.top - popupH - 6;
    }

    // Clamp so popup never goes above the topbar or below the viewport
    if (top < 6) top = 6;
    if (top + popupH > viewportH - 6) top = viewportH - popupH - 6;

    // Clamp horizontally
    if (left + popupW > viewportW - 12) left = viewportW - popupW - 12;
    if (left < 12) left = 12;

    setPosition({ top, left });
  }, [anchorRect]);

  // Drag-and-drop
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragOffsetRef.current = {
      x: e.clientX - (position?.left ?? 0),
      y: e.clientY - (position?.top ?? 0),
    };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !popupRef.current) return;
      const newLeft = e.clientX - dragOffsetRef.current.x;
      const newTop = e.clientY - dragOffsetRef.current.y;
      const popupW = popupRef.current.offsetWidth;
      const popupH = popupRef.current.offsetHeight;
      setPosition({
        top: Math.max(0, Math.min(newTop, window.innerHeight - popupH)),
        left: Math.max(0, Math.min(newLeft, window.innerWidth - popupW)),
      });
    };
    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (isDraggingRef.current) return;
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediate close from the click that opened the popup
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Listen for AI result messages
  useEffect(() => {
    const handler = (msg: { type: string; payload: { requestId: string; result?: AiResultData; error?: string } }) => {
      if (!requestIdRef.current) return;
      if (msg.payload?.requestId !== requestIdRef.current) return;

      if (msg.type === 'AI_RESULT' && msg.payload.result) {
        setAiResult(msg.payload.result);
        setAiLoading(null);
        requestIdRef.current = null;
      } else if (msg.type === 'AI_STREAM_ERROR') {
        setAiError(msg.payload.error ?? 'AI error');
        setAiLoading(null);
        requestIdRef.current = null;
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const handleStatusChange = useCallback((status: WordStatus) => {
    setCurrentStatus(status);
    onStatusChange(lemma, status);
    sendMessage({ type: 'SET_WORD_STATUS', payload: { lemma, status } }).catch(console.error);
  }, [lemma, onStatusChange]);

  const handleAIAction = useCallback((type: AIActionType) => {
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    requestIdRef.current = reqId;
    setAiResult(null);
    setAiError(null);
    setAiLoading(type);

    if (type === 'explain-word') {
      sendMessage({
        type: 'EXPLAIN_WORD_WITH_AI',
        payload: { word: lemma, sentence, level: settings.learnerLevel, requestId: reqId },
      }).catch(err => {
        setAiError((err as Error).message);
        setAiLoading(null);
      });
    } else if (type === 'explain-sentence') {
      sendMessage({
        type: 'EXPLAIN_SENTENCE_WITH_AI',
        payload: { sentence, level: settings.learnerLevel, requestId: reqId },
      }).catch(err => {
        setAiError((err as Error).message);
        setAiLoading(null);
      });
    } else if (type === 'translate') {
      sendMessage({
        type: 'TRANSLATE_SENTENCE_WITH_AI',
        payload: { sentence, requestId: reqId },
      }).catch(err => {
        setAiError((err as Error).message);
        setAiLoading(null);
      });
    }
  }, [lemma, sentence, settings.learnerLevel]);

  const handleSaveCard = useCallback(async () => {
    if (cardSaved !== 'idle') return;
    setCardSaved('saving');
    try {
      // Trigger on-demand audio capture: VideoOverlay will seek the video to
      // the current subtitle's start, play through to the end, and record the
      // tab audio. We wait for the result via a response event.
      let sentenceAudioDataUrl: string | undefined;
      try {
        sentenceAudioDataUrl = await new Promise<string | undefined>((resolve) => {
          const timeout = setTimeout(() => {
            window.removeEventListener('syntagma:sentence-audio-ready', onReady);
            resolve(undefined); // Give up after 35s (max cue = 30s + buffer)
          }, 35_000);

          const onReady = (e: Event) => {
            clearTimeout(timeout);
            window.removeEventListener('syntagma:sentence-audio-ready', onReady);
            resolve((e as CustomEvent).detail?.audioDataUrl);
          };
          window.addEventListener('syntagma:sentence-audio-ready', onReady);
          window.dispatchEvent(new CustomEvent('syntagma:capture-sentence-audio', {
            detail: (sentenceStartMs !== undefined && sentenceEndMs !== undefined)
              ? { startMs: sentenceStartMs, endMs: sentenceEndMs }
              : {},
          }));
        });
      } catch { /* not in video context or capture unavailable */ }

      const card = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        lemma,
        surfaceForm: surface,
        sentence,
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        trMeaning: lexeme?.trMeaning ?? (translations[0] ?? ''),
        screenshotDataUrl: screenshot ?? undefined,
        sentenceAudioDataUrl,
        createdAt: Date.now(),
        deckName: 'Syntagma',
        tags: ['syntagma'],
      };
      const result = await sendMessage<{ ok: boolean; error?: string }>({
        type: 'CREATE_FLASHCARD',
        payload: card,
      });
      if (!result.ok) throw new Error(result.error ?? 'Could not save flashcard');
      setCardSaved('done');
      setTimeout(() => setCardSaved('idle'), 2000);
    } catch {
      setCardSaved('error');
      setTimeout(() => setCardSaved('idle'), 2000);
    }
  }, [cardSaved, lemma, surface, sentence, lexeme, translations]);

  const popupStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 2147483645,
    background: C.overlay,
    backdropFilter: 'blur(12px)',
    border: `1px solid ${C.surface1}`,
    borderRadius: '8px',
    padding: '12px',
    width: '340px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '13px',
    color: C.text,
    ...(position ? { top: position.top, left: position.left } : { top: -9999, left: -9999, visibility: 'hidden' as const }),
    ...(isDragging ? { userSelect: 'none' as const, cursor: 'grabbing' } : {}),
  };

  return (
    <div ref={popupRef} style={popupStyle}>
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '14px',
          marginBottom: '6px',
          marginTop: '-4px',
          cursor: isDragging ? 'grabbing' : 'grab',
          borderRadius: '4px',
        }}
      >
        <svg width="24" height="8" viewBox="0 0 24 8" fill={C.surface2}>
          <circle cx="7" cy="2" r="1.5"/>
          <circle cx="12" cy="2" r="1.5"/>
          <circle cx="17" cy="2" r="1.5"/>
          <circle cx="7" cy="6" r="1.5"/>
          <circle cx="12" cy="6" r="1.5"/>
          <circle cx="17" cy="6" r="1.5"/>
        </svg>
      </div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          {/* Headword */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: C.text }}>{surface}</span>
            {surface.toLowerCase() !== lemma && (
              <span style={{ fontSize: '12px', color: C.subtext }}>({lemma})</span>
            )}
            <FreqBadge rank={freqEntry?.rank} />
          </div>
          {/* Turkish meaning if available */}
          {lexeme?.trMeaning && (
            <div style={{ fontSize: '12px', color: C.blue, fontStyle: 'italic' }}>
              {lexeme.trMeaning}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={handleSaveCard}
            title={!settings.authToken ? 'Log in to save cards' : cardSaved === 'done' ? 'Card saved!' : cardSaved === 'error' ? 'Save failed' : 'Add to flashcards'}
            disabled={!settings.authToken || cardSaved === 'saving'}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: cardSaved === 'done' ? C.green : cardSaved === 'error' ? C.red : C.mauve,
              color: C.base,
              border: 'none',
              cursor: cardSaved === 'idle' ? 'pointer' : 'default',
              padding: 0,
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            {cardSaved === 'done' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ) : cardSaved === 'error' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Card save feedback */}
      {(cardSaved === 'done' || cardSaved === 'error') && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: cardSaved === 'done' ? C.green + '22' : C.red + '22',
          border: `1px solid ${cardSaved === 'done' ? C.green : C.red}`,
          borderRadius: '5px', padding: '5px 9px',
          marginBottom: '8px', fontSize: '12px', fontWeight: 600,
          color: cardSaved === 'done' ? C.green : C.red,
        }}>
          {cardSaved === 'done' ? '✓ Card saved to your flashcards!' : '✕ Failed to save card. Try again.'}
        </div>
      )}

      {/* Sentence context */}
      {sentence && (
        <div style={{
          background: C.surface0,
          borderRadius: '4px',
          padding: '6px 8px',
          marginBottom: '8px',
          fontSize: '12px',
          color: C.subtext,
          lineHeight: 1.5,
          fontStyle: 'italic',
          maxHeight: '120px',
          overflowY: 'auto',
        }}>
          {sentence}
        </div>
      )}

      {/* Video screenshot */}
      {screenshot && (
        <div style={{ marginBottom: '8px', borderRadius: '5px', overflow: 'hidden', lineHeight: 0 }}>
          <img
            src={screenshot}
            alt="video frame"
            style={{ width: '100%', display: 'block', borderRadius: '5px' }}
          />
        </div>
      )}

      {/* Action buttons */}
      <PopupButtons
        word={lemma}
        sentence={sentence}
        level={settings.learnerLevel}
        audioUrl={lexeme?.audioUrl}
        onAIAction={handleAIAction}
        aiLoading={aiLoading}
      />

      {/* Dictionary Translations */}
      {translations.length > 0 && (
        <ul style={{
          margin: '0 0 12px 24px',
          padding: 0,
          color: C.text,
          fontSize: '14px',
          fontWeight: 600,
          lineHeight: 1.4,
        }}>
          {translations.map((tr: string, idx: number) => (
            <li key={idx} style={{ paddingLeft: '4px', marginBottom: '4px' }}>{tr}</li>
          ))}
        </ul>
      )}

      {/* AI output panel */}
      <AIPanel result={aiResult} loading={aiLoading !== null} error={aiError} />

      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderTop: `1px solid ${C.surface1}`, paddingTop: '10px' }}>
        <StatusRow
          currentStatus={currentStatus}
          onStatusChange={handleStatusChange}
        />
      </div>

    </div>
  );
}

// ─── Mount/unmount helpers ───────────────────────────────────────────────────

let popupRoot: ReturnType<typeof createRoot> | null = null;
let popupContainer: HTMLElement | null = null;

export function mountWordPopup(props: WordPopupProps, opts?: { zIndex?: number }): void {
  dismissWordPopup();

  popupContainer = document.createElement('div');
  popupContainer.id = 'syntagma-popup-root';
  popupContainer.setAttribute('data-syntagma', '');
  if (opts?.zIndex !== undefined) {
    popupContainer.style.position = 'fixed';
    popupContainer.style.zIndex = String(opts.zIndex);
    popupContainer.style.top = '0';
    popupContainer.style.left = '0';
    popupContainer.style.width = '0';
    popupContainer.style.height = '0';
    popupContainer.style.overflow = 'visible';
  }
  // Append to <html> to avoid CSS transform containment issues on YouTube/Netflix body.
  document.documentElement.appendChild(popupContainer);

  popupRoot = createRoot(popupContainer);
  popupRoot.render(<WordPopupInner {...props} />);
}

export function dismissWordPopup(): void {
  if (popupRoot) {
    popupRoot.unmount();
    popupRoot = null;
  }
  popupContainer?.remove();
  popupContainer = null;
}
