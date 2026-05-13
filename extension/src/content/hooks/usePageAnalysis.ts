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

export interface PageAnalysisOptions {
  blocks?: Token[][];
}

const EMPTY: PageAnalysis = {
  comprehensionScore: 0,
  iPlusOneSentences: 0,
  unknownWords: [],
  counts: { total: 0, known: 0, learning: 0, unknown: 0 },
};

function countIPlusOneFromTokenBlocks(
  blocks: Token[][],
  lexemes: Record<string, LexemeEntry>
): number {
  let count = 0;
  for (const block of blocks) {
    if (block.length === 0) continue;
    const seenUnknown = new Set<string>();
    for (const token of block) {
      const status = lexemes[token.lemma]?.status ?? 'unknown';
      if (status === 'unknown') seenUnknown.add(token.lemma);
      if (seenUnknown.size > 1) break;
    }
    if (seenUnknown.size === 1) count++;
  }
  return count;
}

function countIPlusOneFromDom(
  lexemes: Record<string, LexemeEntry>
): number {
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
        if (seenUnknown.size > 1) break;
      }
      if (seenUnknown.size === 1) iPlusOneSentences++;
    }
  } catch {
    return 0;
  }
  return iPlusOneSentences;
}

export function usePageAnalysis(
  tokens: Token[],
  lexemes: Record<string, LexemeEntry>,
  options?: PageAnalysisOptions,
): PageAnalysis {
  const blocks = options?.blocks;
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

    const iPlusOneSentences = blocks
      ? countIPlusOneFromTokenBlocks(blocks, lexemes)
      : countIPlusOneFromDom(lexemes);

    const unknownWords = [...unknownMap.values()]
      .sort((a, b) => b.occurrences - a.occurrences);

    return { comprehensionScore, iPlusOneSentences, unknownWords, counts: { total, known, learning, unknown } };
  }, [tokens, lexemes, blocks]);
}
