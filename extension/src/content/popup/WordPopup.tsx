import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import type { WordStatus, LexemeEntry, UserSettings } from '../../shared/types';
import { sendMessage } from '../../shared/messages';
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

function AIPanel({ content, loading, error }: { content: string; loading: boolean; error?: string | null }) {
  if (!content && !loading && !error) return null;

  return (
    <div style={{
      background: C.surface0,
      borderRadius: '6px',
      padding: '8px 10px',
      marginBottom: '8px',
      fontSize: '12px',
      color: C.text,
      lineHeight: 1.6,
      maxHeight: '200px',
      overflowY: 'auto',
      whiteSpace: 'pre-wrap',
    }}>
      {error ? (
        <span style={{ color: C.red }}>{error}</span>
      ) : loading && !content ? (
        <span style={{ color: C.subtext }}>Thinking…</span>
      ) : (
        <span>{content}</span>
      )}
      {loading && content && (
        <span style={{ color: C.subtext, animation: 'none' }}>▊</span>
      )}
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
  onClose,
  onStatusChange,
}: WordPopupProps) {
  const [currentStatus, setCurrentStatus] = useState<WordStatus>(lexeme?.status ?? 'unknown');
  const [aiContent, setAiContent] = useState('');
  const [aiLoading, setAiLoading] = useState<AIActionType | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [cardSaved, setCardSaved] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const popupRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef<string | null>(null);

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

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
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

  // Listen for AI stream messages
  useEffect(() => {
    const handler = (msg: { type: string; payload: { requestId: string; chunk?: string; error?: string } }) => {
      if (!requestIdRef.current) return;
      if (msg.payload?.requestId !== requestIdRef.current) return;

      if (msg.type === 'AI_STREAM_CHUNK') {
        setAiContent(prev => prev + (msg.payload.chunk ?? ''));
      } else if (msg.type === 'AI_STREAM_DONE') {
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
    setAiContent('');
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
      const card = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        lemma,
        surfaceForm: surface,
        sentence,
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        trMeaning: lexeme?.trMeaning ?? (translations[0] ?? ''),
        createdAt: Date.now(),
        deckName: 'Syntagma',
        tags: ['syntagma'],
      };
      await sendMessage({ type: 'CREATE_FLASHCARD', payload: card });
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
  };

  return (
    <div ref={popupRef} style={popupStyle}>
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
            title={cardSaved === 'done' ? 'Card saved!' : cardSaved === 'error' ? 'Save failed' : 'Add to flashcards'}
            disabled={cardSaved === 'saving'}
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
        }}>
          {sentence.length > 180 ? sentence.slice(0, 180) + '…' : sentence}
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
      <AIPanel content={aiContent} loading={aiLoading !== null} error={aiError} />

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
  document.body.appendChild(popupContainer);

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
