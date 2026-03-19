import { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { WordStatus, LexemeEntry, UserSettings } from '../../shared/types';
import { sendMessage } from '../../shared/messages';
import { lookupFrequency, getFrequencyBand } from '../../shared/frequency';
import { StatusRow } from './StatusRow';
import { PopupButtons } from './PopupButtons';
import { CardCreator } from './CardCreator';

const C = {
  base: '#1e1e2e',
  surface0: '#313244',
  surface1: '#45475a',
  surface2: '#585b70',
  text: '#cdd6f4',
  subtext: '#a6adc8',
  blue: '#cba6f7',
  red: '#cba6f7',
  amber: '#fab387',
  green: '#a6e3a1',
  mauve: '#cba6f7',
  overlay: 'rgba(30,30,46,0.97)',
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
  const [showCardCreator, setShowCardCreator] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef<string | null>(null);

  const freqEntry = lookupFrequency(lemma);

  // Calculate position
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;

    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const popupH = popup.offsetHeight || 300;
    const popupW = popup.offsetWidth || 340;

    let top = anchorRect.bottom + window.scrollY + 6;
    let left = anchorRect.left + window.scrollX;

    // Flip above if near bottom
    if (anchorRect.bottom + popupH + 20 > viewportH) {
      top = anchorRect.top + window.scrollY - popupH - 6;
    }

    // Clamp horizontally
    if (left + popupW > viewportW - 12) {
      left = viewportW - popupW - 12;
    }
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

  const popupStyle: React.CSSProperties = {
    position: 'absolute',
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
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: C.subtext,
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            padding: '0 0 0 8px',
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

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

      {/* AI output panel */}
      <AIPanel content={aiContent} loading={aiLoading !== null} error={aiError} />

      {/* Status row + Add Card button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ flex: 1 }}>
          <StatusRow
            currentStatus={currentStatus}
            onStatusChange={handleStatusChange}
          />
        </div>
        <button
          onClick={() => setShowCardCreator(v => !v)}
          title="Create flashcard"
          style={{
            background: showCardCreator ? C.amber : C.surface0,
            color: showCardCreator ? C.base : C.subtext,
            border: `1px solid ${showCardCreator ? C.amber : C.surface1}`,
            borderRadius: '4px',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '14px',
            lineHeight: 1,
            flexShrink: 0,
            transition: 'all 0.15s',
          }}
        >
          📇
        </button>
      </div>

      {/* Card creator */}
      {showCardCreator && (
        <CardCreator
          lemma={lemma}
          surface={surface}
          sentence={sentence}
          lexeme={lexeme}
          onSaved={() => setShowCardCreator(false)}
          onCancel={() => setShowCardCreator(false)}
        />
      )}
    </div>
  );
}

// ─── Mount/unmount helpers ───────────────────────────────────────────────────

let popupRoot: ReturnType<typeof createRoot> | null = null;
let popupContainer: HTMLElement | null = null;

export function mountWordPopup(props: WordPopupProps): void {
  dismissWordPopup();

  popupContainer = document.createElement('div');
  popupContainer.id = 'syntagma-popup-root';
  popupContainer.setAttribute('data-syntagma', '');
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
