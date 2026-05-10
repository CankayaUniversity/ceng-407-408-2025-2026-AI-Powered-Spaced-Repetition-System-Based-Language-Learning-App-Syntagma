import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import type { SubtitleCue, LexemeEntry, UserSettings, WordStatus } from '../../shared/types';
import { parseSubtitleFile } from './subtitle-parser';
import { mountWordPopup, dismissWordPopup } from '../popup/WordPopup';
import { buildSentences } from './sentence-grouping';
import type { SentenceGroup } from './sentence-grouping';

// ─── Text tokeniser (mirrors SubtitleDisplay) ─────────────────────────────────

interface TextToken { text: string; isWord: boolean; }

function tokenize(text: string): TextToken[] {
  return text
    .split(/(\b[a-zA-Z']+\b)/)
    .filter(p => p.length > 0)
    .map(p => ({ text: p, isWord: /^[a-zA-Z']+$/.test(p) }));
}

// ─── Memoized sentence row ────────────────────────────────────────────────────

interface SentenceRowProps {
  sentence: SentenceGroup;
  isActive: boolean;
  selected: boolean;
  lexemes: Record<string, LexemeEntry>;
  showColors: boolean;
  audioUrls: string[];
  onSeek: (sentence: SentenceGroup) => void;
  onToggleSelect: (sentenceKey: string) => void;
  onWordClick: (lemma: string, surface: string, sentence: string, rect: DOMRect, startMs: number, endMs: number) => void;
}

async function playSequential(urls: string[]) {
  for (const u of urls) {
    await new Promise<void>(resolve => {
      const a = new Audio(u);
      const done = () => resolve();
      a.onended = done;
      a.onerror = done;
      a.play().catch(done);
    });
  }
}

const CueRow = memo(function CueRow({ sentence, isActive, selected, lexemes, showColors, audioUrls, onSeek, onToggleSelect, onWordClick }: SentenceRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Scroll into view when this row becomes active.
  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [isActive]);

  // Tokenize once per sentence text, not on every render.
  const tokens = useMemo(() => tokenize(sentence.text), [sentence.text]);

  const words = useMemo(() => sentence.text.match(/\b[a-zA-Z]+\b/g) ?? [], [sentence.text]);
  const hasUnknown = words.some(w => { const s = lexemes[w.toLowerCase()]?.status; return !s || s === 'unknown'; });
  const hasLearning = !hasUnknown && words.some(w => lexemes[w.toLowerCase()]?.status === 'learning');

  const leftBorder = isActive
    ? `3px solid rgba(160,120,85,1)`
    : showColors && hasUnknown
      ? `3px solid rgba(217,119,98,0.4)`
      : showColors && hasLearning
        ? `3px solid rgba(160,120,85,0.35)`
        : '3px solid transparent';

  return (
    <div
      ref={rowRef}
      onClick={() => onSeek(sentence)}
      style={{
        display: 'flex', gap: '8px', alignItems: 'flex-start',
        padding: '6px 8px 6px 6px', borderRadius: '6px', cursor: 'pointer',
        pointerEvents: 'auto',
        background: selected
          ? 'rgba(152,193,217,0.14)'
          : isActive ? 'rgba(160,120,85,0.10)' : 'transparent',
        borderLeft: leftBorder, transition: 'background 0.12s', marginBottom: '1px',
      }}
    >
      <button
        onClick={e => { e.stopPropagation(); onToggleSelect(sentence.key); }}
        title={selected ? 'Remove from flashcard context' : 'Add to flashcard context'}
        style={{
          flexShrink: 0,
          width: '14px', height: '14px',
          marginTop: '3px',
          borderRadius: '3px',
          border: `1.5px solid ${selected ? 'rgba(152,193,217,1)' : 'rgba(135,118,102,0.45)'}`,
          background: selected ? 'rgba(152,193,217,1)' : 'transparent',
          cursor: 'pointer',
          padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <span style={{
        fontSize: '10px',
        color: isActive ? 'rgba(160,120,85,1)' : 'rgba(152,193,217,1)',
        minWidth: '36px', paddingTop: '2px', fontVariantNumeric: 'tabular-nums',
        flexShrink: 0, fontWeight: isActive ? 700 : 500,
        textDecoration: 'underline',
        textDecorationColor: isActive ? 'rgba(160,120,85,1)' : 'rgba(152,193,217,0.4)',
        textUnderlineOffset: '2px',
      }}>
        {formatTime(sentence.startMs)}
      </span>

      {audioUrls.length > 0 && (
        <button
          onClick={e => {
            e.stopPropagation();
            playSequential(audioUrls);
          }}
          title="Play recorded audio"
          style={{
            flexShrink: 0,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0 2px',
            color: 'rgba(168,182,147,0.9)',
            fontSize: '10px',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          ▶
        </button>
      )}

      <span style={{
        fontSize: '12px', lineHeight: 1.5,
        color: isActive ? '#4A3B2C' : '#6A5545',
        wordBreak: 'break-word', fontWeight: isActive ? 500 : 400,
      }}>
        {tokens.map((tok, ti) => {
          if (!tok.isWord) return <span key={ti}>{tok.text}</span>;
          const lemma = tok.text.toLowerCase();
          const status = lexemes[lemma]?.status ?? 'unknown';
          const underlineColor = showColors
            ? (status === 'unknown'  ? 'rgba(217,119,98,0.55)' :
               status === 'learning' ? 'rgba(160,120,85,0.55)' :
               'transparent')
            : 'transparent';
          return (
            <span
              key={ti}
              onClick={e => {
                e.stopPropagation();
                onWordClick(lemma, tok.text, sentence.text, (e.currentTarget as HTMLElement).getBoundingClientRect(), sentence.startMs, sentence.endMs);
              }}
              style={{
                cursor: 'pointer',
                pointerEvents: 'auto',
                borderBottom: `1.5px solid ${underlineColor}`,
                paddingBottom: '1px',
              }}
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
  const [activeSentenceKey, setActiveSentenceKey] = useState<string | null>(null);
  // After a manual row click we hold the highlight on the clicked sentence
  // until video.currentTime actually enters its range. A fixed time lock
  // would flip back to the previous sentence during the LEAD_IN gap, while
  // a buffering seek can outlast any reasonable timeout.
  const pendingClickRef = useRef<{ key: string; startMs: number; endMs: number } | null>(null);
  // Sentences manually checked by the user to expand flashcard context.
  // When the user clicks a word inside a selected sentence, the popup
  // receives the joined text + the selection's full time range.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const [showImport, setShowImport] = useState(false);
  const [localLexemes, setLocalLexemes] = useState(lexemes);
  const [localSettings, setLocalSettings] = useState(settings);
  const [audioMap, setAudioMap] = useState<Record<number, string>>({});
  const listRef = useRef<HTMLDivElement>(null);

  // Keep local lexemes in sync with prop (e.g. overlay status changes)
  useEffect(() => { setLocalLexemes(lexemes); }, [lexemes]);

  // Keep settings in sync when the user changes them from the topbar/options
  // (the sidebar is mounted once, so the settings prop never changes after init).
  useEffect(() => {
    const handler = (e: Event) => {
      const patch = (e as CustomEvent<Partial<UserSettings>>).detail;
      setLocalSettings(prev => ({ ...prev, ...patch }));
    };
    window.addEventListener('syntagma:settings-updated', handler);
    return () => window.removeEventListener('syntagma:settings-updated', handler);
  }, []);

  // Mirror the auto-detected subtitle offset broadcast by VideoOverlay.
  const [detectedOffsetMs, setDetectedOffsetMs] = useState(0);
  useEffect(() => {
    const handler = (e: Event) => {
      setDetectedOffsetMs((e as CustomEvent<{ offsetMs: number }>).detail.offsetMs);
    };
    window.addEventListener('syntagma:subtitle-offset', handler);
    return () => window.removeEventListener('syntagma:subtitle-offset', handler);
  }, []);

  // Listen for audio clips recorded by VideoOverlay
  useEffect(() => {
    const handler = (e: Event) => {
      const { cueIndex, dataUrl } = (e as CustomEvent<{ cueIndex: number; dataUrl: string }>).detail;
      setAudioMap(prev => ({ ...prev, [cueIndex]: dataUrl }));
    };
    window.addEventListener('syntagma:audio-recorded', handler);
    return () => window.removeEventListener('syntagma:audio-recorded', handler);
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



  // Seek on cue row click — apply the same timing offset used by the overlay so
  // clicking a cue lands at the actual speech start, not the window-open time.
  // Also immediately update currentCue so the highlight reflects the click
  // without waiting for the next timeupdate event from VideoOverlay.
  const handleSeek = useCallback((sentence: SentenceGroup) => {
    const isNetflix = window.location.hostname.includes('netflix.com');
    // Auto-detected YouTube caption offset is calibrated from one cue and
    // doesn't apply uniformly to every cue; on long multi-cue sentences it
    // overshoots into the middle. Skip it for seek and use a small lead-in
    // so the user always lands just before the sentence start.
    const LEAD_IN_MS = 250;
    const adjusted = Math.max(0, sentence.startMs - LEAD_IN_MS + localSettings.targetSubtitleOffsetMs);

    if (isNetflix) {
      window.dispatchEvent(new CustomEvent('syntagma:netflix-seek', {
        detail: { timeMs: adjusted }
      }));
    } else {
      video.currentTime = adjusted / 1000;
      video.play().catch(() => {});
    }

    setActiveSentenceKey(sentence.key);
    pendingClickRef.current = {
      key: sentence.key,
      startMs: sentence.startMs,
      endMs: sentence.endMs,
    };
  }, [video, localSettings.targetSubtitleOffsetMs]);

  // Keep a ref to localLexemes so handleWordClick doesn't need it as a
  // dependency. Without this, every lexeme status change creates a new
  // handleWordClick reference, which invalidates all memoized CueRow props
  // and causes every visible row to re-render.
  const localLexemesRef = useRef(localLexemes);
  useEffect(() => { localLexemesRef.current = localLexemes; }, [localLexemes]);
  const selectedKeysRef = useRef(selectedKeys);
  useEffect(() => { selectedKeysRef.current = selectedKeys; }, [selectedKeys]);
  const sentencesRef = useRef<SentenceGroup[]>([]);

  // Word click — open popup (stops propagation so the row seek doesn't fire)
  const handleWordClick = useCallback((
    lemma: string, surface: string, sentence: string, rect: DOMRect,
    sentenceStartMs: number, sentenceEndMs: number,
  ) => {
    if (localSettings.pauseOnWordInteraction && !video.paused) video.pause();
    const now = Date.now();

    // If the clicked word's sentence belongs to the user's manual selection,
    // combine all selected sentences (chronologically) into one context block
    // so the flashcard captures broader meaning + audio span.
    let popupSentence = sentence;
    let popupStartMs = sentenceStartMs;
    let popupEndMs = sentenceEndMs;
    const clickedKey = sentencesRef.current.find(
      s => s.startMs === sentenceStartMs && s.text === sentence,
    )?.key;
    if (clickedKey && selectedKeysRef.current.has(clickedKey)) {
      const picked = sentencesRef.current
        .filter(s => selectedKeysRef.current.has(s.key))
        .slice()
        .sort((a, b) => a.startMs - b.startMs);
      if (picked.length > 0) {
        popupSentence = picked.map(s => s.text).join(' ');
        popupStartMs = picked[0].startMs;
        popupEndMs = picked[picked.length - 1].endMs;
      }
    }

    mountWordPopup({
      lemma, surface, sentence: popupSentence, anchorRect: rect,
      lexeme: localLexemesRef.current[lemma] ?? null,
      settings: localSettings,
      sentenceStartMs: popupStartMs,
      sentenceEndMs: popupEndMs,
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
  }, [localSettings, video, onStatusChange]);

  const sentences = useMemo(() => buildSentences(cues), [cues]);
  useEffect(() => { sentencesRef.current = sentences; }, [sentences]);

  // Drive active-sentence highlight directly from video.currentTime via rAF.
  // This avoids the cue-event flicker (A→B→A→B at boundaries) and gives a
  // single source of truth for "which sentence is being heard right now".
  // Apply the same offsets the overlay uses so the highlight matches the
  // on-screen subtitle. Inside silent gaps we hold on the most recently
  // started sentence to avoid losing the highlight between sentences.
  useEffect(() => {
    if (sentences.length === 0) return;
    let raf = 0;
    const tick = () => {
      const adjustedMs = video.currentTime * 1000;
      // Adaptive lock: hold the clicked sentence until video.currentTime
      // actually crosses into its range (covers seek lead-in, buffering,
      // and the caption-time vs. video-time offset).
      const pending = pendingClickRef.current;
      if (pending) {
        // Keep the clicked sentence highlighted until the normal rAF
        // logic independently agrees with the click (i.e. picks the
        // same sentence). This handles seek lead-in, buffering, and
        // offset mismatches without a fixed timeout.
        const normalKey = (() => {
          let a: SentenceGroup | null = null;
          let fb: SentenceGroup | null = null;
          for (const s of sentences) {
            if (s.startMs > adjustedMs) break;
            fb = s;
            if (s.endMs > adjustedMs) { a = s; break; }
          }
          return (a ?? fb)?.key ?? null;
        })();
        if (normalKey !== pending.key) {
          setActiveSentenceKey(prev => (prev === pending.key ? prev : pending.key));
          raf = requestAnimationFrame(tick);
          return;
        }
        pendingClickRef.current = null;
      }
      // Prefer the sentence whose range CONTAINS currentTime. Fall back
      // to the most recently started one during silent gaps.
      let active: SentenceGroup | null = null;
      let fallback: SentenceGroup | null = null;
      for (const s of sentences) {
        if (s.startMs > adjustedMs) break;
        fallback = s;
        if (s.endMs > adjustedMs) { active = s; break; }
      }
      if (!active) active = fallback;
      const key = active?.key ?? null;
      setActiveSentenceKey(prev => (prev === key ? prev : key));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [video, sentences]);

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
          zIndex: 2147483647,
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
              letterSpacing: '0.6px',
            }}>
              TRANSCRIPT
            </span>
            {cues.length > 0 && (
              <span style={{ fontSize: '10px', color: C.subtext, opacity: 0.65 }}>
                · {sentences.length} sentences
              </span>
            )}
            {selectedKeys.size > 0 && (
              <button
                onClick={() => setSelectedKeys(new Set())}
                title="Clear context selection"
                style={{
                  background: 'rgba(152,193,217,0.18)',
                  border: `1px solid rgba(152,193,217,0.45)`,
                  borderRadius: '4px',
                  color: C.blue,
                  padding: '1px 6px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: 600,
                  marginLeft: '4px',
                }}
              >
                {selectedKeys.size} selected ✕
              </button>
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
            {sentences.map(sentence => (
              <CueRow
                key={sentence.key}
                sentence={sentence}
                isActive={sentence.key === activeSentenceKey}
                selected={selectedKeys.has(sentence.key)}
                lexemes={localLexemes}
                showColors={localSettings.showLearningStatusColors}
                audioUrls={sentence.cueIndices.map(i => audioMap[i]).filter((u): u is string => !!u)}
                onSeek={handleSeek}
                onToggleSelect={toggleSelect}
                onWordClick={handleWordClick}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
