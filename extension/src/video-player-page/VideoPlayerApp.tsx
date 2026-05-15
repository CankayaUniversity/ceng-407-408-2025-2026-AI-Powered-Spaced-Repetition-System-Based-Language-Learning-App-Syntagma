import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { SettingsDrawer } from '../content/video/SettingsDrawer';
import type { UserSettings, LexemeEntry, WordStatus, SubtitleCue, FlashcardPayload } from '../shared/types';
import { DEFAULT_SETTINGS, userScopedKey } from '../shared/storage';
import { sendMessage } from '../shared/messages';
import { parseSubtitleFile } from '../content/video/subtitle-parser';
import { buildSentences } from '../content/video/sentence-grouping';
import type { SentenceGroup } from '../content/video/sentence-grouping';
import { lookupFrequency } from '../shared/frequency';
import { initFrequencyTable } from '../shared/frequency';
import { tokenize } from '../content/video/tokenizer';
import { useT, LocaleToggle, type UILocale } from '../shared/i18n';

// ─── Theme (warm, matches extension) ─────────────────────────────────────────

const C = {
  base:     '#F5F1E9',
  surface0: '#FFFFFF',
  surface1: '#E2DACE',
  surface2: '#C9BEAD',
  text:     '#4A3B2C',
  subtext:  '#877666',
  blue:     '#98C1D9',
  green:    '#A8B693',
  amber:    '#E9C46A',
  red:      '#D97762',
  overlay:  'rgba(245, 241, 233, 0.97)',
};

function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const dataSize = length * numCh * bytesPerSample;
  const headerSize = 44;
  const out = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(out);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numCh; ch++) channels.push(buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

async function getStoredUserId(): Promise<string | null> {
  const result = await chrome.storage.local.get('userSettings');
  return (result.userSettings as any)?.authUserId ?? null;
}

// ─── Rolling VTT detection + dedup ──────────────────────────────────────────
// YouTube-style rolling VTTs repeat the previous line's text as their first
// line, with new words appended on the second line. After parseVTT joins the
// lines, each cue's text is "prev_tail new_words". buildSentences then merges
// everything into monster paragraphs because there's no punctuation.
//
// Strategy: detect rolling overlap, extract only the NEW words per cue, and
// build SentenceGroups directly (one per phrase) instead of going through
// buildSentences which would re-merge them.

function findOverlap(prevWords: string[], curWords: string[]): number {
  const max = Math.min(prevWords.length, curWords.length);
  let best = 0;
  for (let k = 1; k <= max; k++) {
    if (prevWords.slice(-k).join(' ') === curWords.slice(0, k).join(' ')) best = k;
  }
  return best;
}

function isRollingVTT(cues: SubtitleCue[]): boolean {
  if (cues.length < 3) return false;
  let overlaps = 0;
  const check = Math.min(cues.length, 10);
  for (let i = 1; i < check; i++) {
    const prevW = cues[i - 1].text.split(/\s+/);
    const curW = cues[i].text.split(/\s+/);
    if (findOverlap(prevW, curW) >= 2) overlaps++;
  }
  return overlaps / (check - 1) > 0.5;
}

const ROLLING_MAX_WORDS = 14;

function buildSentencesFromRolling(cues: SubtitleCue[]): SentenceGroup[] {
  if (cues.length === 0) return [];

  // Step 1: extract only NEW words per cue with interpolated timing.
  // A single cue can produce multiple new-word fragments from different
  // overlap positions, and multiple fragments can share one cue's time
  // range. Interpolate start/end per fragment proportionally.
  interface Fragment { text: string; startMs: number; endMs: number; cueIndex: number; }
  const fragments: Fragment[] = [];
  let prevWords: string[] = [];

  for (const cue of cues) {
    const curWords = cue.text.split(/\s+/).filter(w => w.length > 0);
    if (curWords.length === 0) continue;

    const overlap = prevWords.length > 0 ? findOverlap(prevWords, curWords) : 0;
    const newWords = overlap > 0 ? curWords.slice(overlap) : curWords;

    if (newWords.length > 0) {
      fragments.push({
        text: newWords.join(' '),
        startMs: cue.startMs,
        endMs: cue.endMs,
        cueIndex: cue.index,
      });
    }
    prevWords = curWords;
  }

  // Step 2: merge consecutive fragments into phrases up to ROLLING_MAX_WORDS,
  // splitting at sentence terminators (.!?) when present.
  const groups: SentenceGroup[] = [];
  let buf: string[] = [];
  let idxs: number[] = [];
  let startMs = 0;
  let endMs = 0;
  let firstIdx = 0;
  let wordCount = 0;

  const flush = () => {
    const text = buf.join(' ').trim();
    if (!text) return;
    groups.push({
      key: `r-${firstIdx}-${groups.length}`,
      text,
      startMs,
      endMs,
      firstCueIndex: firstIdx,
      cueIndices: idxs.slice(),
    });
    buf = [];
    idxs = [];
    wordCount = 0;
  };

  for (const frag of fragments) {
    const fragWords = frag.text.split(/\s+/);
    const hasTerminator = /[.!?]["')\]]?\s*$/.test(frag.text);

    if (buf.length === 0) {
      startMs = frag.startMs;
      firstIdx = frag.cueIndex;
    }

    buf.push(frag.text);
    if (!idxs.includes(frag.cueIndex)) idxs.push(frag.cueIndex);
    endMs = frag.endMs;
    wordCount += fragWords.length;

    if (hasTerminator || wordCount >= ROLLING_MAX_WORDS) {
      flush();
    }
  }
  flush();

  return groups;
}

// ─── Play sentence audio range ──────────────────────────────────────────────

function playSentenceRange(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  audioRef: React.RefObject<HTMLAudioElement | null>,
  audioSrc: string | null,
  sentence: SentenceGroup,
) {
  const primary = videoRef.current ?? audioRef.current;
  if (!primary) return;
  const startSec = Math.max(0, sentence.startMs - 250) / 1000;
  const endSec = sentence.endMs / 1000;
  primary.currentTime = startSec;
  if (videoRef.current && audioRef.current && audioSrc) {
    audioRef.current.currentTime = startSec;
    audioRef.current.play().catch(() => {});
  }
  primary.play().catch(() => {});
  const onTime = () => {
    if (primary.currentTime >= endSec) {
      primary.pause();
      audioRef.current?.pause();
      primary.removeEventListener('timeupdate', onTime);
    }
  };
  primary.addEventListener('timeupdate', onTime);
}

// ─── Sentence Row (memoized, mirrors VideoSidebarPanel) ──────────────────────

interface SentenceRowProps {
  sentence: SentenceGroup;
  isActive: boolean;
  selected: boolean;
  lexemes: Record<string, LexemeEntry>;
  showColors: boolean;
  hasPlayback: boolean;
  onSeek: (sentence: SentenceGroup) => void;
  onToggleSelect: (sentenceKey: string) => void;
  onPlaySentence: (sentence: SentenceGroup) => void;
  onWordClick: (lemma: string, surface: string, sentence: string, rect: DOMRect, startMs: number, endMs: number) => void;
}

const CueRow = memo(function CueRow({ sentence, isActive, selected, lexemes, showColors, hasPlayback, onSeek, onToggleSelect, onPlaySentence, onWordClick }: SentenceRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const tokens = useMemo(() => tokenize(sentence.text), [sentence.text]);

  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [isActive]);

  const tokenStatuses = useMemo(() => {
    const out: Array<'known' | 'learning' | 'unknown'> = [];
    for (const tok of tokens) {
      if (!tok.isWord) continue;
      const lookups = tok.lemmas ?? [tok.text.toLowerCase()];
      const statuses = lookups.map(l => lexemes[l]?.status);
      if (statuses.includes('known') || statuses.includes('ignored')) out.push('known');
      else if (statuses.includes('learning')) out.push('learning');
      else out.push('unknown');
    }
    return out;
  }, [tokens, lexemes]);
  const hasUnknown = tokenStatuses.includes('unknown');
  const hasLearning = !hasUnknown && tokenStatuses.includes('learning');

  const leftBorder = isActive
    ? `3px solid rgba(233,196,106,1)`
    : showColors && hasUnknown
      ? `3px solid rgba(217,119,98,0.4)`
      : showColors && hasLearning
        ? `3px solid rgba(233,196,106,0.35)`
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
          : isActive ? 'rgba(233,196,106,0.10)' : 'transparent',
        borderLeft: leftBorder, transition: 'background 0.12s', marginBottom: '1px',
      }}
    >
      {/* Select checkbox */}
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

      {/* Timestamp */}
      <span style={{
        fontSize: '10px',
        color: isActive ? 'rgba(233,196,106,1)' : 'rgba(152,193,217,1)',
        minWidth: '36px', paddingTop: '2px', fontVariantNumeric: 'tabular-nums',
        flexShrink: 0, fontWeight: isActive ? 700 : 500,
        textDecoration: 'underline',
        textDecorationColor: isActive ? 'rgba(233,196,106,1)' : 'rgba(152,193,217,0.4)',
        textUnderlineOffset: '2px',
      }}>
        {formatTime(sentence.startMs)}
      </span>

      {/* Play button */}
      {hasPlayback && (
        <button
          onClick={e => { e.stopPropagation(); onPlaySentence(sentence); }}
          title="Play this sentence"
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

      {/* Tokenized sentence text */}
      <span style={{
        fontSize: '12px', lineHeight: 1.5,
        color: isActive ? '#4A3B2C' : '#6A5545',
        wordBreak: 'break-word', fontWeight: isActive ? 500 : 400,
      }}>
        {tokens.map((tok, ti) => {
          if (!tok.isWord) return <span key={ti}>{tok.text}</span>;
          const lookups = tok.lemmas ?? [tok.text.toLowerCase()];
          const statuses = lookups.map(l => lexemes[l]?.status);
          const worst = statuses.includes('known') ? 'known'
            : statuses.includes('learning') ? 'learning'
            : statuses.includes('ignored') ? 'ignored' : 'unknown';
          const underlineColor = showColors
            ? (worst === 'unknown'  ? 'rgba(217,119,98,0.55)' :
               worst === 'learning' ? 'rgba(233,196,106,0.55)' :
               'transparent')
            : 'transparent';
          const clickLemma = lookups[0];
          return (
            <span
              key={ti}
              onClick={e => {
                e.stopPropagation();
                onWordClick(clickLemma, tok.text, sentence.text, (e.currentTarget as HTMLElement).getBoundingClientRect(), sentence.startMs, sentence.endMs);
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

// ─── Word Popup (inline, matches extension style) ────────────────────────────

interface WordPopupState {
  word: string;
  surface: string;
  sentence: string;
  startMs: number;
  endMs: number;
  anchorRect: DOMRect;
}



function VideoWordPopup({
  popup, lexemes, settings, videoName, videoRef, audioRef, audioSrc,
  captureAudio,
  onClose, onStatusChange,
}: {
  popup: WordPopupState;
  lexemes: Record<string, LexemeEntry>;
  settings: UserSettings;
  videoName: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioSrc: string | null;
  captureAudio: (startMs: number, endMs: number) => Promise<string | undefined>;
  onClose: () => void;
  onStatusChange: (lemma: string, status: WordStatus) => void;
}) {
  const { word, surface, sentence, anchorRect } = popup;
  const lexeme = lexemes[word] ?? null;
  const [currentStatus, setCurrentStatus] = useState<WordStatus>(lexeme?.status ?? 'unknown');
  const [translations, setTranslations] = useState<string[]>([]);
  const [cardSaved, setCardSaved] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const wasPlayingRef = useRef(false);
  const freqEntry = lookupFrequency(word);

  // Pause video on mount, resume on unmount (close)
  useEffect(() => {
    const primary = videoRef.current ?? audioRef.current;
    if (primary && !primary.paused) {
      wasPlayingRef.current = true;
      primary.pause();
      if (audioSrc) audioRef.current?.pause();
    } else {
      wasPlayingRef.current = false;
    }
    return () => {
      if (wasPlayingRef.current && settings.resumeAfterInteraction) {
        const resume = () => {
          const el = videoRef.current ?? audioRef.current;
          if (el) {
            el.play().catch(() => {});
            if (audioSrc && audioRef.current) {
              audioRef.current.currentTime = el.currentTime;
              audioRef.current.play().catch(() => {});
            }
          }
        };
        if (settings.resumeDelayMs > 0) {
          setTimeout(resume, settings.resumeDelayMs);
        } else {
          resume();
        }
      }
    };
  }, [videoRef, audioRef, audioSrc, settings.resumeAfterInteraction, settings.resumeDelayMs]);

  useEffect(() => {
    sendMessage<{ translations: string[] }>({
      type: 'LOOKUP_DICTIONARY',
      payload: { word },
    }).then(res => setTranslations(res?.translations ?? [])).catch(() => {});
  }, [word]);

  // Position popup on the right side, just left of the 300px sidebar, near the top
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    const vH = window.innerHeight;
    const vW = window.innerWidth;
    const pH = popup.offsetHeight || 300;
    const pW = popup.offsetWidth || 340;
    const sidebarWidth = 300;

    const left = vW - sidebarWidth - pW - 4;
    const top = 50;

    setPosition({ top: Math.min(top, vH - pH - 6), left: Math.max(12, left) });
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
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !popupRef.current) return;
      const pW = popupRef.current.offsetWidth;
      const pH = popupRef.current.offsetHeight;
      setPosition({
        top: Math.max(0, Math.min(e.clientY - dragOffsetRef.current.y, window.innerHeight - pH)),
        left: Math.max(0, Math.min(e.clientX - dragOffsetRef.current.x, window.innerWidth - pW)),
      });
    };
    const onUp = () => {
      if (isDraggingRef.current) { isDraggingRef.current = false; setIsDragging(false); }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (isDraggingRef.current) return;
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const STATUS_CONFIG: Array<{ status: WordStatus; color: string; label: string }> = [
    { status: 'unknown', color: C.red, label: 'Unknown' },
    { status: 'learning', color: C.amber, label: 'Learning' },
    { status: 'known', color: C.green, label: 'Known' },
    { status: 'ignored', color: C.subtext, label: 'Ignore' },
  ];

  const handleStatusChange = useCallback((status: WordStatus) => {
    setCurrentStatus(status);
    onStatusChange(word, status);
    sendMessage({ type: 'SET_WORD_STATUS', payload: { lemma: word, status } }).catch(console.error);
  }, [word, onStatusChange]);

  const handleCycleStatus = useCallback(() => {
    const idx = STATUS_CONFIG.findIndex(c => c.status === currentStatus);
    const next = STATUS_CONFIG[(idx + 1) % STATUS_CONFIG.length];
    handleStatusChange(next.status);
  }, [currentStatus, handleStatusChange]);

  const handleSaveCard = useCallback(async () => {
    if (cardSaved !== 'idle') return;
    setCardSaved('saving');
    try {
      let sentenceAudioDataUrl: string | undefined;
      try {
        sentenceAudioDataUrl = await captureAudio(popup.startMs, popup.endMs);
      } catch (e) {
        console.warn('[Syntagma] Audio capture failed for quick-save:', e);
      }
      const card: FlashcardPayload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        lemma: word,
        surfaceForm: surface,
        sentence,
        sourceUrl: `syntagma-video://${videoName}`,
        sourceTitle: videoName || 'Video',
        trMeaning: lexeme?.trMeaning ?? (translations[0] ?? ''),
        createdAt: Date.now(),
        deckName: settings.activeCollectionName || 'Syntagma',
        tags: ['syntagma', 'video-player'],
        sentenceAudioDataUrl,
      };
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
      const result = await Promise.race([
        sendMessage<{ ok: boolean; error?: string }>({ type: 'CREATE_FLASHCARD', payload: card }),
        timeout,
      ]);
      if (!result.ok) throw new Error(result.error || 'Server error');
      setCardSaved('done');
      handleStatusChange('learning');
      setTimeout(() => setCardSaved('idle'), 2500);
    } catch {
      setCardSaved('error');
      setTimeout(() => setCardSaved('idle'), 3000);
    }
  }, [cardSaved, word, surface, sentence, popup.startMs, popup.endMs, lexeme, translations, videoName, settings, handleStatusChange, captureAudio]);

  const handleOpenCardCreator = useCallback(async () => {
    let screenshotDataUrl: string | undefined;
    if (videoRef.current) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0);
          screenshotDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        }
      } catch {}
    }
    let sentenceAudioDataUrl: string | undefined;
    try {
      sentenceAudioDataUrl = await captureAudio(popup.startMs, popup.endMs);
    } catch (e) {
      console.warn('[Syntagma] Audio capture failed for card creator:', e);
    }
    sendMessage({
      type: 'OPEN_CARD_CREATOR',
      payload: {
        mode: 'create',
        panel: 'dictionary',
        word,
        sentence,
        sourceUrl: `syntagma-video://${videoName}`,
        sourceTitle: videoName || 'Video',
        trMeaning: lexeme?.trMeaning ?? (translations[0] ?? ''),
        screenshotDataUrl,
        sentenceAudioDataUrl,
      },
    }).catch(() => {});
  }, [word, sentence, popup.startMs, popup.endMs, videoName, lexeme, translations, videoRef, captureAudio]);

  const currentCfg = STATUS_CONFIG.find(c => c.status === currentStatus) ?? STATUS_CONFIG[0];

  const btnStyle = (active?: boolean, color?: string): React.CSSProperties => ({
    width: '32px', height: '32px', borderRadius: '16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? (color ?? C.blue) : 'transparent',
    color: active ? C.base : (color ?? C.blue),
    border: `1.5px solid ${color ?? C.blue}`,
    cursor: 'pointer', padding: 0, transition: 'all 0.15s', flexShrink: 0,
  });

  return (
    <div ref={popupRef} style={{
      position: 'fixed', zIndex: 2147483645, width: '340px',
      background: C.overlay, backdropFilter: 'blur(12px)',
      border: `1px solid ${C.surface1}`, borderRadius: '8px',
      padding: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '13px', color: C.text,
      ...(position ? { top: position.top, left: position.left } : { top: -9999, left: -9999, visibility: 'hidden' as const }),
      ...(isDragging ? { userSelect: 'none' as const, cursor: 'grabbing' } : {}),
    }}>
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          height: '14px', marginBottom: '6px', marginTop: '-4px',
          cursor: isDragging ? 'grabbing' : 'grab', borderRadius: '4px',
        }}
      >
        <svg width="24" height="8" viewBox="0 0 24 8" fill={C.surface2}>
          <circle cx="7" cy="2" r="1.5"/><circle cx="12" cy="2" r="1.5"/><circle cx="17" cy="2" r="1.5"/>
          <circle cx="7" cy="6" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="17" cy="6" r="1.5"/>
        </svg>
      </div>

      {/* Header: word + flashcard + card creator buttons */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: C.text }}>{surface}</span>
            {surface.toLowerCase() !== word && (
              <span style={{ fontSize: '12px', color: C.subtext }}>({word})</span>
            )}
            {freqEntry && (
              <span style={{ background: C.surface1, color: C.subtext, borderRadius: '3px', padding: '1px 5px', fontSize: '10px', fontWeight: 600 }}>
                #{freqEntry.rank}
              </span>
            )}
          </div>
          {lexeme?.trMeaning && (
            <div style={{ fontSize: '12px', color: C.blue, fontStyle: 'italic' }}>{lexeme.trMeaning}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={handleSaveCard}
            title={!settings.authToken ? 'Log in to save cards' : cardSaved === 'done' ? 'Card saved!' : 'Quick add to flashcards'}
            disabled={!settings.authToken || cardSaved !== 'idle'}
            style={{
              height: '28px', borderRadius: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              background: cardSaved === 'done' ? C.green : cardSaved === 'error' ? C.red : cardSaved === 'saving' ? C.amber : C.green,
              color: C.base, border: 'none',
              cursor: cardSaved === 'idle' ? 'pointer' : 'default',
              padding: '0 10px', transition: 'background 0.2s', flexShrink: 0,
              fontSize: '11px', fontWeight: 700,
            }}
          >
            {cardSaved === 'done' ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Saved!
              </>
            ) : cardSaved === 'error' ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                Error
              </>
            ) : cardSaved === 'saving' ? (
              <>Saving...</>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
                Save
              </>
            )}
          </button>
          <button
            onClick={handleOpenCardCreator}
            title={!settings.authToken ? 'Log in to edit cards' : 'Open in card creator'}
            disabled={!settings.authToken}
            style={{
              width: '32px', height: '32px', borderRadius: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: C.blue, color: C.base, border: 'none',
              cursor: settings.authToken ? 'pointer' : 'default',
              padding: 0, transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Card save feedback */}
      {(cardSaved === 'done' || cardSaved === 'error') && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: cardSaved === 'done' ? C.green + '22' : C.red + '22',
          border: `1px solid ${cardSaved === 'done' ? C.green : C.red}`,
          borderRadius: '5px', padding: '5px 9px', marginBottom: '8px',
          fontSize: '12px', fontWeight: 600,
          color: cardSaved === 'done' ? C.green : C.red,
        }}>
          {cardSaved === 'done' ? 'Card saved to your flashcards!' : 'Failed to save card. Try again.'}
        </div>
      )}

      {/* Sentence context */}
      {sentence && (
        <div style={{
          background: C.surface0, borderRadius: '4px', padding: '6px 8px',
          marginBottom: '8px', fontSize: '12px', color: C.subtext,
          lineHeight: 1.5, fontStyle: 'italic', maxHeight: '80px', overflowY: 'auto',
        }}>
          {sentence}
        </div>
      )}

      {/* Pronounce button */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        <button onClick={() => {
          const u = new SpeechSynthesisUtterance(surface);
          u.lang = 'en-US'; u.rate = 0.85;
          window.speechSynthesis.speak(u);
        }} style={btnStyle(false, C.green)} title="Pronounce word">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
        </button>
      </div>

      {/* Dictionary translations */}
      {translations.length > 0 && (
        <ul style={{ margin: '0 0 12px 24px', padding: 0, color: C.text, fontSize: '14px', fontWeight: 600, lineHeight: 1.4 }}>
          {translations.map((tr, idx) => <li key={idx} style={{ paddingLeft: '4px', marginBottom: '4px' }}>{tr}</li>)}
        </ul>
      )}

      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderTop: `1px solid ${C.surface1}`, paddingTop: '10px' }}>
        <button onClick={handleCycleStatus} title="Click to cycle status" style={{
          background: currentCfg.color, color: C.base, border: 'none', borderRadius: '16px',
          padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 800,
          transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px',
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          {currentCfg.label}
        </button>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export function VideoPlayerApp() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const _ = useT(settings);
  const handleLocaleToggle = useCallback((next: UILocale) => {
    setSettings(prev => ({ ...prev, uiLocale: next }));
    sendMessage({ type: 'SET_SETTINGS', payload: { uiLocale: next } }).catch(() => {});
  }, []);

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [videoName, setVideoName] = useState('');
  const [loading, setLoading] = useState(false);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lexemes, setLexemes] = useState<Record<string, LexemeEntry>>({});
  const [wordPopup, setWordPopup] = useState<WordPopupState | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [subPosition, setSubPosition] = useState<'bottom' | 'top'>('bottom');
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [isSubRevealed, setIsSubRevealed] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const subtitleFileRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  const hasMedia = !!videoSrc || !!audioSrc;
  const rolling = useMemo(() => isRollingVTT(cues), [cues]);
  const sentences = useMemo(
    () => rolling ? buildSentencesFromRolling(cues) : buildSentences(cues),
    [cues, rolling],
  );

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handlePlaySentence = useCallback((sentence: SentenceGroup) => {
    playSentenceRange(videoRef, audioRef, audioSrc, sentence);
  }, [audioSrc]);

  // Find active sentence from currentTime
  const activeSentence = useMemo(() => {
    const ms = currentTime * 1000;
    let active: SentenceGroup | null = null;
    let fallback: SentenceGroup | null = null;
    for (const s of sentences) {
      if (s.startMs > ms) break;
      fallback = s;
      if (s.endMs > ms) { active = s; break; }
    }
    return active ?? fallback;
  }, [sentences, currentTime]);

  // For the subtitle overlay, use the active sentence text (handles both rolling and normal)
  const activeOverlayText = useMemo(() => {
    if (!activeSentence) return null;
    const ms = currentTime * 1000;
    if (ms >= activeSentence.startMs && ms <= activeSentence.endMs) return activeSentence.text;
    return null;
  }, [activeSentence, currentTime]);

  useEffect(() => {
    Promise.all([
      sendMessage<UserSettings>({ type: 'GET_SETTINGS', payload: null }),
      initFrequencyTable(),
    ]).then(([s]) => setSettings(s)).catch(() => {});
  }, []);

  // Load lexemes
  useEffect(() => {
    getStoredUserId().then(userId => {
      const key = userScopedKey('lexemes', userId);
      chrome.storage.local.get(key).then(r => {
        setLexemes((r[key] ?? {}) as Record<string, LexemeEntry>);
      });
    });
  }, []);

  // Listen for status changes
  useEffect(() => {
    const listener = (msg: any) => {
      if (msg.type === 'STATUS_CHANGED') {
        const { lemma, status } = msg.payload;
        setLexemes(prev => ({
          ...prev,
          [lemma]: { ...(prev[lemma] ?? { key: lemma, lemma, surface: lemma, status: 'unknown', seenCount: 0, lastSeenAt: 0, createdAt: 0 }), status } as LexemeEntry,
        }));
      }
      if (msg.type === 'WORD_KNOWLEDGE_DELETED') {
        const { lemma } = msg.payload;
        setLexemes(prev => { const next = { ...prev }; delete next[lemma]; return next; });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleSettingChange = useCallback(<K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      chrome.storage.local.get('userSettings').then(r => {
        chrome.storage.local.set({ userSettings: { ...(r.userSettings ?? {}), [key]: value } });
      });
      return next;
    });
  }, []);

  const seekTo = useCallback((time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time;
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  // ── Auto-pause ────────────────────────────────────────────────────────────
  const autoPausedSentenceRef = useRef<string | null>(null);
  useEffect(() => {
    if (settings.autoPauseMode === 'off' || !isPlaying || sentences.length === 0) return;
    const ms = currentTime * 1000;
    const mode = settings.autoPauseMode;
    const primary = videoRef.current ?? audioRef.current;
    if (!primary) return;
    for (const s of sentences) {
      if (mode === 'before' || mode === 'before-and-after') {
        const key = `before-${s.key}`;
        if (ms >= s.startMs - 400 && ms < s.startMs && autoPausedSentenceRef.current !== key) {
          autoPausedSentenceRef.current = key;
          primary.pause(); audioRef.current?.pause(); setIsPlaying(false); break;
        }
      }
      if (mode === 'after' || mode === 'before-and-after') {
        const key = `after-${s.key}`;
        if (ms >= s.endMs && ms < s.endMs + 500 && autoPausedSentenceRef.current !== key) {
          autoPausedSentenceRef.current = key;
          primary.pause(); audioRef.current?.pause(); setIsPlaying(false); break;
        }
      }
      if (mode === 'rewind-and-pause') {
        const key = `rewind-${s.key}`;
        if (ms >= s.endMs && ms < s.endMs + 500 && autoPausedSentenceRef.current !== key) {
          autoPausedSentenceRef.current = key;
          const t = Math.max(0, s.startMs - 250) / 1000;
          primary.pause(); primary.currentTime = t;
          if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = t; }
          setIsPlaying(false); break;
        }
      }
    }
  }, [currentTime, sentences, settings.autoPauseMode, isPlaying]);

  // ── Scene-skip ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (settings.sceneSkipMode === 'off' || !isPlaying) return;
    const primary = videoRef.current ?? audioRef.current;
    if (!primary) return;
    const ms = currentTime * 1000 + settings.targetSubtitleOffsetMs;
    const hasActiveSub = sentences.some(s => ms >= s.startMs && ms <= s.endMs);
    if (hasActiveSub) { if (primary.playbackRate !== 1.0) primary.playbackRate = 1.0; return; }
    const next = sentences.find(s => s.startMs > ms);
    if (!next || next.startMs - ms < 1500) { if (primary.playbackRate !== 1.0) primary.playbackRate = 1.0; return; }
    if (settings.sceneSkipMode === 'jump') {
      seekTo(Math.max(0, next.startMs - 250) / 1000);
    } else {
      const rate = settings.sceneSkipMode === '2x' ? 2 : settings.sceneSkipMode === '4x' ? 4 : settings.sceneSkipMode === '6x' ? 6 : 8;
      if (primary.playbackRate !== rate) primary.playbackRate = rate;
    }
  }, [currentTime, sentences, settings.sceneSkipMode, settings.targetSubtitleOffsetMs, isPlaying, seekTo]);

  // ── Reveal on pause ───────────────────────────────────────────────────────
  useEffect(() => {
    if (settings.targetSubtitleObscure === 'off') { setIsSubRevealed(true); return; }
    if (settings.revealOnPause && !isPlaying) { setIsSubRevealed(true); return; }
    setIsSubRevealed(false);
  }, [isPlaying, settings.revealOnPause, settings.targetSubtitleObscure]);

  const decodeAudioFromUrl = useCallback(async (url: string) => {
    const resp = await fetch(url);
    const arrayBuf = await resp.arrayBuffer();
    const ctx = new AudioContext();
    audioBufferRef.current = await ctx.decodeAudioData(arrayBuf);
    await ctx.close();
  }, []);

  const handleImportVideo = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setVideoName(file.name);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    decodeAudioFromUrl(url).catch(() => console.warn('[Syntagma] Could not decode audio from video'));
    setLoading(false);
    e.target.value = '';
  }, [decodeAudioFromUrl]);

  const handleImportAudio = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!videoName) setVideoName(file.name);
    const url = URL.createObjectURL(file);
    setAudioSrc(url);
    decodeAudioFromUrl(url).catch(() => console.warn('[Syntagma] Could not decode audio track'));
    e.target.value = '';
  }, [videoName, decodeAudioFromUrl]);

  const captureAudio = useCallback(async (startMs: number, endMs: number): Promise<string | undefined> => {
    if (!audioBufferRef.current) return undefined;
    const buf = audioBufferRef.current;
    const sr = buf.sampleRate;
    const startSample = Math.max(0, Math.floor((startMs / 1000) * sr));
    const endSample = Math.min(buf.length, Math.ceil((endMs / 1000) * sr));
    const length = endSample - startSample;
    if (length <= 0) return undefined;

    const numCh = buf.numberOfChannels;
    const offline = new OfflineAudioContext(numCh, length, sr);
    const source = offline.createBufferSource();
    const slice = offline.createBuffer(numCh, length, sr);
    for (let ch = 0; ch < numCh; ch++) {
      slice.copyToChannel(buf.getChannelData(ch).subarray(startSample, endSample), ch);
    }
    source.buffer = slice;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();

    // Encode as WAV data URL
    const wavBlob = encodeWav(rendered);
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => typeof reader.result === 'string' ? resolve(reader.result) : reject();
      reader.onerror = () => reject();
      reader.readAsDataURL(wavBlob);
    });
  }, []);

  const handleImportSubtitle = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseSubtitleFile(text, file.name);
    setCues(parsed);
    e.target.value = '';
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const primary = videoRef.current ?? audioRef.current;
    if (!primary) return;
    setCurrentTime(primary.currentTime);
    if (syncingRef.current) return;
    if (videoRef.current && audioRef.current && audioSrc) {
      const drift = Math.abs(videoRef.current.currentTime - audioRef.current.currentTime);
      if (drift > 0.3) {
        syncingRef.current = true;
        audioRef.current.currentTime = videoRef.current.currentTime;
        syncingRef.current = false;
      }
    }
  }, [audioSrc]);

  const handleLoadedMetadata = useCallback(() => {
    const primary = videoRef.current ?? audioRef.current;
    if (primary) setDuration(primary.duration);
  }, []);

  const togglePlay = useCallback(() => {
    const primary = videoRef.current ?? audioRef.current;
    if (!primary) return;
    if (primary.paused) {
      primary.play();
      if (videoRef.current && audioRef.current && audioSrc) {
        audioRef.current.currentTime = videoRef.current.currentTime;
        audioRef.current.play();
      }
      setIsPlaying(true);
    } else {
      primary.pause();
      audioRef.current?.pause();
      setIsPlaying(false);
    }
  }, [audioSrc]);

  const handleSentenceSeek = useCallback((sentence: SentenceGroup) => {
    const t = Math.max(0, sentence.startMs - 250) / 1000;
    seekTo(t);
    const primary = videoRef.current ?? audioRef.current;
    if (primary?.paused) {
      primary.play();
      if (audioRef.current && audioSrc) audioRef.current.play();
      setIsPlaying(true);
    }
  }, [seekTo, audioSrc]);

  const selectedKeysRef = useRef(selectedKeys);
  useEffect(() => { selectedKeysRef.current = selectedKeys; }, [selectedKeys]);
  const sentencesRef = useRef(sentences);
  useEffect(() => { sentencesRef.current = sentences; }, [sentences]);

  const handleWordClick = useCallback((
    lemma: string, surface: string, sentence: string, rect: DOMRect,
    startMs: number, endMs: number,
  ) => {
    let popupSentence = sentence;
    let popupStartMs = startMs;
    let popupEndMs = endMs;
    const clickedKey = sentencesRef.current.find(
      s => s.startMs === startMs && s.text === sentence,
    )?.key;
    if (clickedKey && selectedKeysRef.current.has(clickedKey)) {
      const picked = sentencesRef.current
        .filter(s => selectedKeysRef.current.has(s.key))
        .sort((a, b) => a.startMs - b.startMs);
      if (picked.length > 0) {
        popupSentence = picked.map(s => s.text).join(' ');
        popupStartMs = picked[0].startMs;
        popupEndMs = picked[picked.length - 1].endMs;
      }
    }
    const open = () => setWordPopup({
      word: lemma, surface, sentence: popupSentence,
      startMs: popupStartMs, endMs: popupEndMs,
      anchorRect: rect,
    });
    if (settings.pauseOnWordInteraction) {
      const primary = videoRef.current ?? audioRef.current;
      if (primary && !primary.paused) {
        primary.pause();
        audioRef.current?.pause();
        setIsPlaying(false);
      }
    }
    if (settings.interactionDelayMs > 0) {
      setTimeout(open, settings.interactionDelayMs);
    } else {
      open();
    }
  }, [settings.pauseOnWordInteraction, settings.interactionDelayMs]);

  const handleStatusChange = useCallback((lemma: string, status: WordStatus) => {
    setLexemes(prev => ({
      ...prev,
      [lemma]: { ...(prev[lemma] ?? { key: lemma, lemma, surface: lemma, status: 'unknown', seenCount: 0, lastSeenAt: 0, createdAt: 0 }), status } as LexemeEntry,
    }));
  }, []);

  // Subtitle overlay word click
  const handleOverlayWordClick = useCallback((lemma: string, surface: string, sentence: string, rect: DOMRect) => {
    handleWordClick(
      lemma, surface, sentence,
      rect,
      activeSentence?.startMs ?? 0,
      activeSentence?.endMs ?? 0,
    );
  }, [handleWordClick, activeSentence]);

  const overlayTokens = useMemo(() => activeOverlayText ? tokenize(activeOverlayText) : [], [activeOverlayText]);

  // Strip bracketed text if setting enabled
  const activeOverlayTextProcessed = useMemo(() => {
    if (!activeOverlayText) return null;
    if (settings.removeBracketedSubtitles) {
      const stripped = activeOverlayText.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
      return stripped || null;
    }
    return activeOverlayText;
  }, [activeOverlayText, settings.removeBracketedSubtitles]);

  const overlayTokensProcessed = useMemo(
    () => activeOverlayTextProcessed ? tokenize(activeOverlayTextProcessed) : [],
    [activeOverlayTextProcessed],
  );

  // Reveal by known status
  const isAllKnownOrIgnored = useMemo(() => {
    if (!settings.revealByKnownStatus || settings.targetSubtitleObscure === 'off') return false;
    const words = overlayTokensProcessed.filter(t => t.isWord);
    if (words.length === 0) return true;
    return words.every(tok => {
      const lookups = tok.lemmas ?? [tok.text.toLowerCase()];
      const statuses = lookups.map(l => lexemes[l]?.status);
      return statuses.includes('known') || statuses.includes('ignored');
    });
  }, [overlayTokensProcessed, lexemes, settings.revealByKnownStatus, settings.targetSubtitleObscure]);

  const finalRevealed = isSubRevealed || isAllKnownOrIgnored;

  return (
    <div style={{
      display: 'flex', height: '100vh', background: C.base,
      color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden',
    }}>
      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', background: C.surface0,
          borderBottom: `1px solid ${C.surface1}`, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
            <span style={{ color: C.blue, fontWeight: 800, fontSize: '16px' }}>Syn</span>
            <span style={{ color: C.amber, fontWeight: 800, fontSize: '16px' }}>tagma</span>
            <span style={{ color: C.subtext, fontSize: '13px', marginLeft: '6px' }}>{_('video.videoPlayer')}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <LocaleToggle settings={settings} onToggle={handleLocaleToggle} />
            <button onClick={() => videoFileRef.current?.click()} style={{
              background: C.blue, color: '#fff', border: 'none', borderRadius: '6px',
              padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>{_('video.loadVideo')}</button>
            <button onClick={() => audioFileRef.current?.click()} style={{
              background: C.surface1, color: C.text, border: `1px solid ${C.surface2}`,
              borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>{audioSrc ? _('common.refresh') : _('video.loadVideo')}</button>
            <button
              onClick={() => subtitleFileRef.current?.click()}
              disabled={!hasMedia}
              style={{
                background: hasMedia ? C.amber : C.surface1,
                color: hasMedia ? '#000' : C.subtext, border: 'none',
                borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                cursor: hasMedia ? 'pointer' : 'not-allowed',
              }}
            >{_('video.loadSubtitles')}</button>
          </div>
        </div>

        {/* Video area */}
        <div data-video-area="" style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', background: '#000', position: 'relative', minHeight: 0,
        }}>
          {!hasMedia && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', color: C.subtext }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={C.surface2} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
              <div style={{ fontSize: '14px' }}>{_('video.noSubtitles')}</div>
              <div style={{ fontSize: '12px', maxWidth: '300px', textAlign: 'center', lineHeight: 1.5 }}>
                {_('video.loadVideo')} → {_('video.loadSubtitles')}
              </div>
            </div>
          )}

          {loading && <div style={{ color: C.subtext, fontSize: '14px' }}>{_('common.loading')}</div>}

          {videoSrc && (
            <video ref={videoRef} src={videoSrc} muted={!!audioSrc}
              onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
              onEnded={() => { setIsPlaying(false); audioRef.current?.pause(); }}
              style={{ maxWidth: '100%', maxHeight: 'calc(100% - 80px)', background: '#000' }}
            />
          )}

          {audioSrc && (
            <audio ref={audioRef} src={audioSrc}
              onTimeUpdate={!videoSrc ? handleTimeUpdate : undefined}
              onLoadedMetadata={!videoSrc ? handleLoadedMetadata : undefined}
              onPlay={!videoSrc ? () => setIsPlaying(true) : undefined}
              onPause={!videoSrc ? () => setIsPlaying(false) : undefined}
              onEnded={!videoSrc ? () => setIsPlaying(false) : undefined}
            />
          )}

          {!videoSrc && audioSrc && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: C.subtext }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{videoName}</div>
              <div style={{ fontSize: '12px', color: C.subtext }}>Audio-only mode</div>
            </div>
          )}

          {/* Subtitle overlay */}
          {hasMedia && activeOverlayTextProcessed && (() => {
            const opacity = settings.subtitleOverlayOpacity;
            const bgAlpha = Math.max(0, Math.min(1, opacity > 0 ? opacity : 0));
            const obscure = settings.targetSubtitleObscure;
            const blurred = obscure === 'blur' && !finalRevealed;
            const hidden = obscure === 'hide' && !finalRevealed;
            return (
              <div
                style={{
                  position: 'absolute',
                  ...(subPosition === 'bottom' ? { bottom: '80px' } : { top: '16px' }),
                  left: '50%', transform: 'translateX(-50%)',
                  background: `rgba(0,0,0,${bgAlpha > 0 ? bgAlpha : 0.75})`,
                  padding: '6px 14px', borderRadius: '4px',
                  fontSize: `${Math.round(((settings.targetSubtitleSize ?? 100) / 100) * 18)}px`,
                  maxWidth: '80%', textAlign: 'center', lineHeight: 1.45,
                  pointerEvents: 'auto',
                  filter: blurred ? 'blur(6px)' : 'none',
                  opacity: hidden ? 0 : 1,
                  transition: 'filter 0.2s, opacity 0.2s',
                  cursor: settings.revealOnHover && obscure !== 'off' ? 'pointer' : 'default',
                }}
                onMouseEnter={() => { if (settings.revealOnHover && obscure !== 'off') setIsSubRevealed(true); }}
                onMouseLeave={() => {
                  if (settings.revealOnHover && obscure !== 'off' && !(settings.revealOnPause && !isPlaying)) {
                    setIsSubRevealed(false);
                  }
                }}
              >
                {overlayTokensProcessed.map((tok, i) => {
                  if (!tok.isWord) return <span key={i} style={{ color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)', fontWeight: 600 }}>{tok.text}</span>;
                  const lookups = tok.lemmas ?? [tok.text.toLowerCase()];
                  const statuses = lookups.map(l => lexemes[l]?.status);
                  const worst = statuses.includes('known') ? 'known'
                    : statuses.includes('learning') ? 'learning'
                    : statuses.includes('ignored') ? 'ignored' : 'unknown';
                  const underline = settings.showLearningStatusColors
                    ? (worst === 'unknown' ? C.red : worst === 'learning' ? C.amber : 'transparent')
                    : 'transparent';
                  const clickLemma = lookups[0];
                  return (
                    <span key={i}
                      onClick={e => handleOverlayWordClick(clickLemma, tok.text, activeOverlayTextProcessed, (e.currentTarget as HTMLElement).getBoundingClientRect())}
                      style={{
                        color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9)', fontWeight: 600,
                        cursor: 'pointer', borderBottom: `2px solid ${underline}`, paddingBottom: '1px',
                        opacity: statuses.includes('ignored') ? 0.5 : 1,
                      }}
                    >{tok.text}</span>
                  );
                })}
              </div>
            );
          })()}

          {/* Settings drawer popup */}
          {showSettingsDrawer && (
            <div style={{
              position: 'absolute', bottom: '56px', right: '16px', zIndex: 20,
            }}>
              <SettingsDrawer
                settings={settings}
                onSettingChange={handleSettingChange}
                onTargetImport={(cues, _fileName) => setCues(cues)}
                onSecondaryImport={() => {}}
                targetTrackSource={cues.length > 0 ? 'import' : 'none'}
                secondaryTrackSource="none"
              />
              {/* Position toggle row */}
              <div style={{
                marginTop: '6px',
                background: 'rgba(12,12,14,0.96)',
                borderRadius: '8px',
                padding: '8px 14px',
                border: '1px solid rgba(255,255,255,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                fontSize: '12px', color: '#E8E0D0',
              }}>
                <span>{_('vid.obscureTarget') === 'vid.obscureTarget' ? 'Position' : 'Position'}</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['bottom', 'top'] as const).map(pos => (
                    <button key={pos} onClick={() => setSubPosition(pos)} style={{
                      background: subPosition === pos ? '#98C1D9' : 'rgba(255,255,255,0.15)',
                      color: subPosition === pos ? '#000' : '#fff',
                      border: 'none', borderRadius: '4px', padding: '3px 10px',
                      fontSize: '11px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                    }}>{pos}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Video controls */}
          {hasMedia && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <button onClick={togglePlay} style={{
                background: 'transparent', border: 'none', color: '#fff',
                cursor: 'pointer', fontSize: '20px', padding: '4px',
              }}>{isPlaying ? '⏸' : '▶'}</button>
              <span style={{ color: '#fff', fontSize: '12px', minWidth: '40px' }}>{formatTime(currentTime * 1000)}</span>
              <input type="range" min={0} max={duration || 0} step={0.1} value={currentTime}
                onChange={e => seekTo(Number(e.target.value))}
                style={{ flex: 1, accentColor: C.blue }}
              />
              <span style={{ color: '#fff', fontSize: '12px', minWidth: '40px' }}>{formatTime(duration * 1000)}</span>

              {/* Settings toggle */}
              <button
                onClick={() => setShowSettingsDrawer(v => !v)}
                title="Settings"
                style={{
                  background: showSettingsDrawer ? 'rgba(152,193,217,0.3)' : 'transparent',
                  border: 'none', color: '#fff', cursor: 'pointer', padding: '4px',
                  borderRadius: '4px', display: 'flex', alignItems: 'center',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar: transcript */}
      <div style={{
        width: '300px', background: C.overlay, backdropFilter: 'blur(12px)',
        borderLeft: `1px solid ${C.surface1}`, display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <style>{`
          #syntagma-vp-scroll::-webkit-scrollbar { width: 4px; }
          #syntagma-vp-scroll::-webkit-scrollbar-track { background: transparent; }
          #syntagma-vp-scroll::-webkit-scrollbar-thumb { background: rgba(135,118,102,0.3); border-radius: 2px; }
          #syntagma-vp-scroll::-webkit-scrollbar-thumb:hover { background: rgba(135,118,102,0.55); }
        `}</style>

        {/* Sidebar header */}
        <div style={{
          padding: '9px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${C.surface1}`, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.subtext} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
            </svg>
            <span style={{ fontSize: '11px', fontWeight: 700, color: C.subtext, letterSpacing: '0.6px' }}>{_('video.transcript').toUpperCase()}</span>
            {sentences.length > 0 && (
              <span style={{ fontSize: '10px', color: C.subtext, opacity: 0.65 }}>· {sentences.length}</span>
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
        </div>

        {/* Hint row */}
        {cues.length > 0 && (
          <div style={{
            padding: '4px 12px', fontSize: '10px', color: C.subtext, opacity: 0.55,
            borderBottom: `1px solid rgba(226,218,206,0.4)`, flexShrink: 0,
          }}>
            {_('home.webLearning.3.prefix')}<span style={{ color: C.red }}>{_('home.webLearning.3.red')}</span>{_('home.webLearning.3.unknown')}<span style={{ color: C.amber }}>{_('home.webLearning.3.yellow')}</span>{_('home.webLearning.3.learning')}
          </div>
        )}

        {/* Transcript list */}
        <div id="syntagma-vp-scroll" ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
          {sentences.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '12px', padding: '24px 20px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '12px', color: C.subtext, lineHeight: 1.6 }}>
                <strong style={{ color: C.text }}>{_('video.noSubtitles')}</strong><br/>
                <span style={{ fontSize: '11px' }}>
                  {hasMedia
                    ? _('video.loadSubtitles')
                    : _('video.loadVideo')}
                </span>
              </div>
            </div>
          ) : (
            sentences.map(sentence => (
              <CueRow
                key={sentence.key}
                sentence={sentence}
                isActive={sentence.key === activeSentence?.key}
                selected={selectedKeys.has(sentence.key)}
                lexemes={lexemes}
                showColors={settings.showLearningStatusColors}
                hasPlayback={hasMedia}
                onSeek={handleSentenceSeek}
                onToggleSelect={toggleSelect}
                onPlaySentence={handlePlaySentence}
                onWordClick={handleWordClick}
              />
            ))
          )}
        </div>
      </div>

      {/* Word popup */}
      {wordPopup && (
        <VideoWordPopup
          key={`${wordPopup.word}-${wordPopup.anchorRect.left}`}
          popup={wordPopup}
          lexemes={lexemes}
          settings={settings}
          videoName={videoName}
          videoRef={videoRef}
          audioRef={audioRef}
          audioSrc={audioSrc}
          captureAudio={captureAudio}
          onClose={() => setWordPopup(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Hidden file inputs */}
      <input ref={videoFileRef} type="file" accept="video/*,.mkv,.avi,.m4v" style={{ display: 'none' }} onChange={handleImportVideo} />
      <input ref={audioFileRef} type="file" accept="audio/*,.m4a,.mp3,.ogg,.wav,.flac,.aac" style={{ display: 'none' }} onChange={handleImportAudio} />
      <input ref={subtitleFileRef} type="file" accept=".srt,.vtt" style={{ display: 'none' }} onChange={handleImportSubtitle} />
    </div>
  );
}
