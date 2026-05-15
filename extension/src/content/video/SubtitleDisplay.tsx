import { useState, useMemo } from 'react';
import type { SubtitleCue, LexemeEntry, UserSettings } from '../../shared/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface TextToken {
  text: string;
  isWord: boolean;
  lemmas?: string[];
}

const CONTRACTIONS: Record<string, string[]> = {
  "i'm": ['i', 'be'], "i'll": ['i', 'will'], "i've": ['i', 'have'], "i'd": ['i', 'would'],
  "it's": ['it', 'be'], "that's": ['that', 'be'], "what's": ['what', 'be'],
  "there's": ['there', 'be'], "here's": ['here', 'be'], "who's": ['who', 'be'],
  "he's": ['he', 'be'], "she's": ['she', 'be'], "let's": ['let', 'us'],
  "won't": ['will', 'not'], "can't": ['can', 'not'], "don't": ['do', 'not'],
  "doesn't": ['do', 'not'], "didn't": ['do', 'not'], "isn't": ['be', 'not'],
  "aren't": ['be', 'not'], "wasn't": ['be', 'not'], "weren't": ['be', 'not'],
  "hasn't": ['have', 'not'], "haven't": ['have', 'not'], "hadn't": ['have', 'not'],
  "wouldn't": ['would', 'not'], "couldn't": ['could', 'not'], "shouldn't": ['should', 'not'],
  "they're": ['they', 'be'], "we're": ['we', 'be'], "you're": ['you', 'be'],
  "they've": ['they', 'have'], "we've": ['we', 'have'], "you've": ['you', 'have'],
  "they'll": ['they', 'will'], "we'll": ['we', 'will'], "you'll": ['you', 'will'],
  "they'd": ['they', 'would'], "we'd": ['we', 'would'], "you'd": ['you', 'would'],
};

function tokenize(text: string): TextToken[] {
  const raw = text
    .split(/(\b[a-zA-Z''']+\b)/)
    .filter(p => p.length > 0);

  const out: TextToken[] = [];
  for (const p of raw) {
    const normalized = p.replace(/['']/g, "'").toLowerCase();
    const expansion = CONTRACTIONS[normalized];
    if (expansion) {
      out.push({ text: p, isWord: true, lemmas: expansion });
    } else {
      out.push({ text: p, isWord: /^[a-zA-Z''']+$/.test(p) });
    }
  }
  return out;
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

  const tokens = useMemo(() => displayText ? tokenize(displayText) : [], [displayText]);

  // Check if every content word is known → auto-reveal
  const allWordsKnown = useMemo(() => {
    if (!displayText || !revealByKnownStatus || language !== 'en') return false;
    const allLemmas: string[] = [];
    for (const tok of tokens) {
      if (!tok.isWord) continue;
      if (tok.lemmas) allLemmas.push(...tok.lemmas);
      else allLemmas.push(tok.text.toLowerCase().replace(/'/g, "'"));
    }
    if (!allLemmas.length) return false;
    return allLemmas.every(l => {
      const s = lexemes[l]?.status;
      return s === 'known' || s === 'ignored';
    });
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
        const statuses = lookups.map(l => lexemes[l]?.status ?? 'unknown');
        const worst = statuses.includes('unknown') ? 'unknown'
          : statuses.includes('learning') ? 'learning' : 'known';
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
