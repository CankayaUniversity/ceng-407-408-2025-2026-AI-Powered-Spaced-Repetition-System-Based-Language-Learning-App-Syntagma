import { useState, useMemo } from 'react';
import type { SubtitleCue, LexemeEntry, UserSettings } from '../../shared/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface TextToken {
  text: string;
  isWord: boolean;
}

function tokenize(text: string): TextToken[] {
  // Split on word boundaries, keeping both word and non-word parts
  return text
    .split(/(\b[a-zA-Z']+\b)/)
    .filter(p => p.length > 0)
    .map(p => ({ text: p, isWord: /^[a-zA-Z']+$/.test(p) }));
}

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

  // Check if every content word is known → auto-reveal
  const allWordsKnown = useMemo(() => {
    if (!displayText || !revealByKnownStatus || language !== 'en') return false;
    const words = displayText.match(/\b[a-zA-Z]+\b/g) ?? [];
    if (!words.length) return false;
    return words.every(w => {
      const s = lexemes[w.toLowerCase()]?.status;
      return s === 'known' || s === 'ignored';
    });
  }, [displayText, lexemes, revealByKnownStatus, language]);

  if (!cue || !displayText) return null;

  const revealed =
    obscureMode === 'off' ||
    (revealOnPause && isPaused) ||
    (revealOnHover && hovering) ||
    allWordsKnown;

  const tokens = tokenize(displayText);

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

        const lemma = tok.text.toLowerCase().replace(/'/g, "'");
        const status = lexemes[lemma]?.status ?? 'unknown';

        const underline = settings.showLearningStatusColors
          ? (status === 'unknown' ? '#D97762' :
             status === 'learning' ? '#E8C06A' :
             'transparent')
          : 'transparent';

        return (
          <span
            key={i}
            onClick={e => {
              e.stopPropagation();
              onWordClick(lemma, tok.text, displayText, (e.currentTarget as HTMLElement).getBoundingClientRect());
            }}
            style={{
              color: '#FFFFFF',
              textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)',
              fontWeight: 600,
              cursor: 'pointer',
              borderBottom: `2px solid ${underline}`,
              paddingBottom: '1px',
              opacity: status === 'ignored' ? 0.5 : 1,
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
