import { useState, useMemo } from 'react';
import type { SubtitleCue, LexemeEntry, UserSettings } from '../../shared/types';
import { tokenize } from './tokenizer';

// ─── Component ────────────────────────────────────────────────────────────────

interface SubtitleDisplayProps {
  cue: SubtitleCue | null;
  language: 'en' | 'tr';
  obscureMode: 'off' | 'blur' | 'hide';
  revealOnPause: boolean;
  revealOnHover: boolean;
  revealByKnownStatus: boolean;
  isPaused: boolean;
  lexemes: Record<string, LexemeEntry>;
  settings: UserSettings;
  fontSize: number; // percent, e.g. 90
  onWordClick: (lemma: string, surface: string, sentence: string, rect: DOMRect) => void;
}

export function SubtitleDisplay({
  cue,
  language,
  obscureMode,
  revealOnPause,
  revealOnHover,
  revealByKnownStatus,
  isPaused,
  lexemes,
  settings,
  fontSize,
  onWordClick,
}: SubtitleDisplayProps) {
  const [hovering, setHovering] = useState(false);

  // Apply bracket removal if enabled
  const displayText = useMemo(() => {
    if (!cue) return null;
    return settings.removeBracketedSubtitles
      ? cue.text.replace(/\[.*?\]|\(.*?\)/g, '').trim()
      : cue.text;
  }, [cue, settings.removeBracketedSubtitles]);

  const tokens = useMemo(() => displayText ? tokenize(displayText) : [], [displayText]);

  const allWordsKnown = useMemo(() => {
    if (!displayText || !revealByKnownStatus || language !== 'en') return false;
    let hasWord = false;
    for (const tok of tokens) {
      if (!tok.isWord) continue;
      hasWord = true;
      const lookups = tok.lemmas ?? [tok.text.toLowerCase().replace(/'/g, "'")];
      const statuses = lookups.map(l => lexemes[l]?.status);
      if (!statuses.includes('known') && !statuses.includes('ignored')) return false;
    }
    return hasWord;
  }, [displayText, tokens, lexemes, revealByKnownStatus, language]);

  if (!cue || !displayText) return null;

  const revealed =
    obscureMode === 'off' ||
    (revealOnPause && isPaused) ||
    (revealOnHover && hovering) ||
    allWordsKnown;

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        textAlign: 'center',
        padding: '6px 14px',
        fontSize: `${fontSize}%`,
        lineHeight: 1.45,
        userSelect: 'none',
        // Explicit — the shadow DOM host chain has pointer-events:none on all
        // ancestor containers. The hover/click handlers on this element and its
        // children require pointer-events to be explicitly enabled here.
        pointerEvents: 'auto',
        filter: !revealed && obscureMode === 'blur' ? 'blur(6px)' : 'none',
        opacity: !revealed && obscureMode === 'hide' ? 0 : 1,
        transition: 'filter 0.2s ease, opacity 0.2s ease',
      }}
    >
      {tokens.map((tok, i) => {
        if (!tok.isWord || language === 'tr') {
          return (
            <span
              key={i}
              style={{
                color: '#FFFFFF',
                textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)',
                fontWeight: 600,
              }}
            >
              {tok.text}
            </span>
          );
        }

        const lookups = tok.lemmas ?? [tok.text.toLowerCase().replace(/'/g, "'")];
        const statuses = lookups.map(l => lexemes[l]?.status);
        const worst = statuses.includes('known') ? 'known'
          : statuses.includes('learning') ? 'learning'
          : statuses.includes('ignored') ? 'ignored' : 'unknown';
        const clickLemma = lookups[0];

        const underline = settings.showLearningStatusColors
          ? (worst === 'unknown' ? '#D97762' :
             worst === 'learning' ? '#E8C06A' :
             'transparent')
          : 'transparent';

        return (
          <span
            key={i}
            onClick={e => {
              e.stopPropagation();
              onWordClick(clickLemma, tok.text, displayText, (e.currentTarget as HTMLElement).getBoundingClientRect());
            }}
            style={{
              color: '#FFFFFF',
              textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)',
              fontWeight: 600,
              cursor: 'pointer',
              // Must be explicit — ancestor containers in the shadow DOM have
              // pointer-events:none, and `pointer-events` is not inherited, so
              // without this the span falls back to the computed default which
              // Chrome may resolve to `none` when all ancestors are `none`.
              pointerEvents: 'auto',
              borderBottom: `2px solid ${underline}`,
              paddingBottom: '1px',
              opacity: statuses.includes('ignored') ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {tok.text}
          </span>
        );
      })}
    </div>
  );
}
