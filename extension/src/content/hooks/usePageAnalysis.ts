import { useMemo } from 'react';
import type { Token, LexemeEntry } from '../../shared/types';

export interface UnknownWordEntry {
  lemma: string;
  surface: string;
  occurrences: number;
  frequencyRank?: number;
}

export interface PageAnalysis {
  comprehensionScore: number;
  iPlusOneSentences: number;
  unknownWords: UnknownWordEntry[];
  counts: { total: number; known: number; learning: number; unknown: number };
}

const EMPTY: PageAnalysis = {
  comprehensionScore: 0,
  iPlusOneSentences: 0,
  unknownWords: [],
  counts: { total: 0, known: 0, learning: 0, unknown: 0 },
};

export function usePageAnalysis(
  tokens: Token[],
  lexemes: Record<string, LexemeEntry>
): PageAnalysis {
  return useMemo(() => {
    if (tokens.length === 0) return EMPTY;

    let known = 0, learning = 0, unknown = 0;
    const unknownMap = new Map<string, UnknownWordEntry>();

    for (const token of tokens) {
      const status = lexemes[token.lemma]?.status ?? 'unknown';
      if (status === 'ignored') continue;
      if (status === 'known') known++;
      else if (status === 'learning') learning++;
      else {
        unknown++;
        const entry = unknownMap.get(token.lemma);
        if (entry) {
          entry.occurrences++;
        } else {
          unknownMap.set(token.lemma, {
            lemma: token.lemma,
            surface: token.surface,
            occurrences: 1,
            frequencyRank: token.frequencyRank,
          });
        }
      }
    }

    const total = known + learning + unknown;
    const comprehensionScore = total > 0
      ? Math.round(((known + 0.5 * learning) / total) * 100)
      : 0;

    // i+1: block elements containing exactly 1 unique unknown lemma
    let iPlusOneSentences = 0;
    const BLOCK_SEL = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, td';
    try {
      const blocks = document.querySelectorAll(BLOCK_SEL);
      for (const block of blocks) {
        const spans = block.querySelectorAll('span[data-syn]');
        if (spans.length === 0) continue;
        const seenUnknown = new Set<string>();
        for (const span of spans) {
          const lemma = (span as HTMLElement).getAttribute('data-syn') ?? '';
          const st = lexemes[lemma]?.status ?? 'unknown';
          if (st === 'unknown') seenUnknown.add(lemma);
        }
        if (seenUnknown.size === 1) iPlusOneSentences++;
      }
    } catch { /* ignore */ }

    const unknownWords = [...unknownMap.values()]
      .sort((a, b) => b.occurrences - a.occurrences);

    return { comprehensionScore, iPlusOneSentences, unknownWords, counts: { total, known, learning, unknown } };
  }, [tokens, lexemes]);
}
