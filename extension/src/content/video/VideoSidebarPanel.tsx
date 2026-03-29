import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import type { SubtitleCue, LexemeEntry, UserSettings, WordStatus } from '../../shared/types';
import { parseSubtitleFile } from './subtitle-parser';
import { mountWordPopup, dismissWordPopup } from '../popup/WordPopup';

// ─── Text tokeniser (mirrors SubtitleDisplay) ─────────────────────────────────

interface TextToken { text: string; isWord: boolean; }

function tokenize(text: string): TextToken[] {
  return text
    .split(/(\b[a-zA-Z']+\b)/)
    .filter(p => p.length > 0)
    .map(p => ({ text: p, isWord: /^[a-zA-Z']+$/.test(p) }));
}

// ─── Memoized cue row ─────────────────────────────────────────────────────────
// Extracted so only the 2 rows that change active-state re-render on each cue
// transition instead of the entire list (~500 rows × N words each).

interface CueRowProps {
  cue: SubtitleCue;
  isActive: boolean;
  lexemes: Record<string, LexemeEntry>;
  onSeek: (cue: SubtitleCue) => void;
  onWordClick: (lemma: string, surface: string, sentence: string, rect: DOMRect) => void;
}

const CueRow = memo(function CueRow({ cue, isActive, lexemes, onSeek, onWordClick }: CueRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Scroll into view when this row becomes active.
  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isActive]);

  // Tokenize once per cue text, not on every render.
  const tokens = useMemo(() => tokenize(cue.text), [cue.text]);

  const words = useMemo(() => cue.text.match(/\b[a-zA-Z]+\b/g) ?? [], [cue.text]);
  const hasUnknown = words.some(w => { const s = lexemes[w.toLowerCase()]?.status; return !s || s === 'unknown'; });
  const hasLearning = !hasUnknown && words.some(w => lexemes[w.toLowerCase()]?.status === 'learning');

  const leftBorder = isActive
    ? `3px solid rgba(160,120,85,1)`
    : hasUnknown
      ? `3px solid rgba(217,119,98,0.4)`
      : hasLearning
        ? `3px solid rgba(160,120,85,0.35)`
        : '3px solid transparent';

  return (
    <div
      ref={rowRef}
      onClick={() => onSeek(cue)}
      style={{
        display: 'flex', gap: '8px', alignItems: 'flex-start',
        padding: '6px 8px 6px 6px', borderRadius: '6px', cursor: 'pointer',
        background: isActive ? 'rgba(160,120,85,0.10)' : 'transparent',
        borderLeft: leftBorder, transition: 'background 0.12s', marginBottom: '1px',
      }}
    >
      <span style={{
        fontSize: '10px',
        color: isActive ? 'rgba(160,120,85,1)' : 'rgba(152,193,217,1)',
        minWidth: '36px', paddingTop: '2px', fontVariantNumeric: 'tabular-nums',
        flexShrink: 0, fontWeight: isActive ? 700 : 500,
        textDecoration: 'underline',
        textDecorationColor: isActive ? 'rgba(160,120,85,1)' : 'rgba(152,193,217,0.4)',
        textUnderlineOffset: '2px',
      }}>
        {formatTime(cue.startMs)}
      </span>

      <span style={{
        fontSize: '12px', lineHeight: 1.5,
        color: isActive ? '#4A3B2C' : '#6A5545',
        wordBreak: 'break-word', fontWeight: isActive ? 500 : 400,
      }}>
        {tokens.map((tok, ti) => {
          if (!tok.isWord) return <span key={ti}>{tok.text}</span>;
          const lemma = tok.text.toLowerCase();
          const status = lexemes[lemma]?.status ?? 'unknown';
          const underlineColor =
            status === 'unknown'  ? 'rgba(217,119,98,0.55)' :
            status === 'learning' ? 'rgba(160,120,85,0.55)' :
            'transparent';
          return (
            <span
              key={ti}
              onClick={e => {
                e.stopPropagation();
                onWordClick(lemma, tok.text, cue.text, (e.currentTarget as HTMLElement).getBoundingClientRect());
              }}
              style={{ cursor: 'pointer', borderBottom: `1.5px solid ${underlineColor}`, paddingBottom: '1px' }}
            >
              {tok.text}
            </span>
          );
        })}
      </span>
    </div>
  );
});

// ─── Constants (shared with layout injection) ─────────────────────────────────

export const SIDEBAR_WIDTH = 300;

// ─── Design tokens (warm, matches the topbar) ─────────────────────────────────

const C = {
  base:    'rgba(245,241,233,0.98)',
  surface1:'rgba(226,218,206,0.85)',
  surface2:'rgba(226,218,206,0.4)',
  text:    '#4A3B2C',
  subtext: '#877666',
  blue:    '#98C1D9',
  red:     '#D97762',
  amber:   '#A07855',
  green:   '#A8B693',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Import button ────────────────────────────────────────────────────────────

function ImportBtn({
  label,
  track,
}: {
  label: string;
  track: 'target' | 'secondary';
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const cues = parseSubtitleFile(text, file.name);
      window.dispatchEvent(
        new CustomEvent('syntagma:subtitle-import', { detail: { cues, track } })
      );
    } catch (err) {
      console.error('[Syntagma] subtitle import failed:', err);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [track]);

  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 9px',
      background: 'rgba(152,193,217,0.12)',
      border: `1px solid rgba(152,193,217,0.4)`,
      borderRadius: '5px',
      fontSize: '11px', fontWeight: 600,
      color: C.blue,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      userSelect: 'none',
      transition: 'background 0.15s',
    }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      {label}
      <input
        ref={inputRef}
        type="file"
        accept=".srt,.vtt"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </label>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface VideoSidebarPanelProps {
  video: HTMLVideoElement;
  cues: SubtitleCue[];
  lexemes: Record<string, LexemeEntry>;
  settings: UserSettings;
  onStatusChange: (lemma: string, status: WordStatus) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VideoSidebarPanel({ video, cues, lexemes, settings, onStatusChange }: VideoSidebarPanelProps) {
  const [visible, setVisible] = useState(true);
  const [currentCue, setCurrentCue] = useState<SubtitleCue | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [localLexemes, setLocalLexemes] = useState(lexemes);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep local lexemes in sync with prop (e.g. overlay status changes)
  useEffect(() => { setLocalLexemes(lexemes); }, [lexemes]);

  // Mirror the auto-detected subtitle offset broadcast by VideoOverlay.
  const [detectedOffsetMs, setDetectedOffsetMs] = useState(0);
  useEffect(() => {
    const handler = (e: Event) => {
      setDetectedOffsetMs((e as CustomEvent<{ offsetMs: number }>).detail.offsetMs);
    };
    window.addEventListener('syntagma:subtitle-offset', handler);
    return () => window.removeEventListener('syntagma:subtitle-offset', handler);
  }, []);

  // Broadcast visibility so topbar button and layout injection can react
  useEffect(() => {
    const event = visible ? 'syntagma:sidebar-visible' : 'syntagma:sidebar-hidden';
    window.dispatchEvent(new CustomEvent(event));
  }, [visible]);

  // Toggle from topbar button
  useEffect(() => {
    const handler = () => setVisible(v => !v);
    window.addEventListener('syntagma:toggle-sidebar', handler);
    return () => window.removeEventListener('syntagma:toggle-sidebar', handler);
  }, []);

  // Track current cue driven by VideoOverlay's active-cue events.
  // The overlay already applies subtitle offset + live-caption text fallback,
  // so the sidebar is always in sync with what's actually shown on screen.
  useEffect(() => {
    const handler = (e: Event) => {
      const { index } = (e as CustomEvent<{ index: number }>).detail;
      if (index < 0) {
        setCurrentCue(null);
        return;
      }
      // cues array is indexed by position; prefer direct array access, fall back to find
      const cue = cues[index] ?? cues.find(c => c.index === index) ?? null;
      setCurrentCue(prev => (prev?.index === index ? prev : cue));
    };
    window.addEventListener('syntagma:active-cue', handler);
    return () => window.removeEventListener('syntagma:active-cue', handler);
  }, [cues]);


  // Seek on cue row click — apply the same timing offset used by the overlay so
  // clicking a cue lands at the actual speech start, not the window-open time.
  // Also immediately update currentCue so the highlight reflects the click
  // without waiting for the next timeupdate event from VideoOverlay.
  const handleSeek = useCallback((cue: SubtitleCue) => {
    const adjusted = cue.startMs + detectedOffsetMs + settings.targetSubtitleOffsetMs;
    video.currentTime = adjusted / 1000;
    video.play().catch(() => {});
    setCurrentCue(cue);
  }, [video, detectedOffsetMs, settings.targetSubtitleOffsetMs]);

  // Word click — open popup (stops propagation so the row seek doesn't fire)
  const handleWordClick = useCallback((
    lemma: string, surface: string, sentence: string, rect: DOMRect,
  ) => {
    if (settings.pauseOnWordInteraction && !video.paused) video.pause();
    const now = Date.now();
    mountWordPopup({
      lemma, surface, sentence, anchorRect: rect,
      lexeme: localLexemes[lemma] ?? null,
      settings,
      onClose: () => { dismissWordPopup(); },
      onStatusChange: (l, status) => {
        setLocalLexemes(prev => ({
          ...prev,
          [l]: {
            ...(prev[l] ?? { key: l, lemma: l, surface: l, type: 'word', seenCount: 1, lastSeenAt: now, createdAt: now }),
            status,
          },
        }));
        onStatusChange(l, status);
      },
    }, { zIndex: 2147483647 });
  }, [localLexemes, settings, video, onStatusChange]);

  if (!visible) return null;

  return (
    <>
      <style>{`
        #syntagma-transcript-scroll::-webkit-scrollbar { width: 4px; }
        #syntagma-transcript-scroll::-webkit-scrollbar-track { background: transparent; }
        #syntagma-transcript-scroll::-webkit-scrollbar-thumb {
          background: rgba(135,118,102,0.3);
          border-radius: 2px;
        }
        #syntagma-transcript-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(135,118,102,0.55);
        }
      `}</style>

      <div
        data-syntagma-sidebar=""
        style={{
          position: 'fixed',
          top: '44px',
          right: '0',
          width: `${SIDEBAR_WIDTH}px`,
          bottom: '0',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 2147483640,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: C.base,
          backdropFilter: 'blur(12px)',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
          borderLeft: `1px solid ${C.surface1}`,
          pointerEvents: 'auto',
        }}
      >
        {/* ── Header row ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '9px 12px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${C.surface1}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke={C.subtext} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="15" y2="12"/>
              <line x1="3" y1="18" x2="18" y2="18"/>
            </svg>
            <span style={{
              fontSize: '11px', fontWeight: 700, color: C.subtext,
              textTransform: 'uppercase', letterSpacing: '0.6px',
            }}>
              Transcript
            </span>
            {cues.length > 0 && (
              <span style={{ fontSize: '10px', color: C.subtext, opacity: 0.65 }}>
                · {cues.length} lines
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {/* Import toggle */}
            <button
              onClick={() => setShowImport(v => !v)}
              title="Import subtitles"
              style={{
                background: showImport ? 'rgba(152,193,217,0.18)' : 'transparent',
                border: `1px solid ${showImport ? 'rgba(152,193,217,0.45)' : 'transparent'}`,
                borderRadius: '5px',
                color: showImport ? C.blue : C.subtext,
                padding: '2px 6px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '3px',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Import
            </button>

            {/* Close */}
            <button
              onClick={() => setVisible(false)}
              title="Close transcript"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: C.subtext, fontSize: '18px', lineHeight: 1,
                padding: '0 2px', opacity: 0.65,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >×</button>
          </div>
        </div>

        {/* ── Import panel ────────────────────────────────────────────────────── */}
        {showImport && (
          <div style={{
            padding: '10px 12px',
            borderBottom: `1px solid ${C.surface1}`,
            flexShrink: 0,
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: C.subtext }}>
              Load external subtitles (SRT / VTT)
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <ImportBtn label="Target (EN)" track="target" />
              <ImportBtn label="Secondary" track="secondary" />
            </div>
            <div style={{ fontSize: '10px', color: C.subtext, opacity: 0.65, lineHeight: 1.4 }}>
              Subtitles appear on the video and in this transcript.
              Words are color-coded by your knowledge status.
            </div>
          </div>
        )}

        {/* ── Hint row ────────────────────────────────────────────────────────── */}
        {cues.length > 0 && (
          <div style={{
            padding: '4px 12px',
            fontSize: '10px', color: C.subtext, opacity: 0.55,
            borderBottom: `1px solid ${C.surface2}`,
            flexShrink: 0,
          }}>
            Click any line to seek · <span style={{ color: C.red }}>red</span> = unknown · <span style={{ color: C.amber }}>amber</span> = learning
          </div>
        )}

        {/* ── Cue list / empty state ──────────────────────────────────────────── */}
        {cues.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '12px', padding: '24px 20px', textAlign: 'center',
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
              stroke={C.subtext} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ opacity: 0.4, animation: 'syn-spin 1.4s linear infinite' }}>
              <circle cx="12" cy="12" r="10" strokeOpacity="0.2"/>
              <path d="M12 2a10 10 0 0 1 10 10"/>
            </svg>
            <style>{`@keyframes syn-spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: '12px', color: C.subtext, lineHeight: 1.6 }}>
              <strong style={{ color: C.text }}>No subtitles yet.</strong><br/>
              <span style={{ fontSize: '11px' }}>
                1. Enable CC on the video, or<br/>
                2. Use <strong>Import</strong> above to load SRT/VTT
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('syntagma:retry-subtitle-capture'))}
                style={{
                  background: 'rgba(152,193,217,0.12)',
                  border: `1px solid rgba(152,193,217,0.4)`,
                  borderRadius: '6px',
                  color: C.blue,
                  padding: '5px 14px',
                  cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600,
                }}
              >↺ Retry subtitle detection</button>
            </div>
          </div>
        ) : (
          <div
            id="syntagma-transcript-scroll"
            ref={listRef}
            style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}
          >
            {cues.map(cue => (
              <CueRow
                key={cue.index}
                cue={cue}
                isActive={currentCue?.index === cue.index}
                lexemes={localLexemes}
                onSeek={handleSeek}
                onWordClick={handleWordClick}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
