import type { CEFRLevel } from './types';
import a1Raw from '../assets/levels/a1.txt?raw';
import a2Raw from '../assets/levels/a2.txt?raw';
import b1Raw from '../assets/levels/b1.txt?raw';
import b2Raw from '../assets/levels/b2.txt?raw';
import c1Raw from '../assets/levels/c1.txt?raw';
import c2Raw from '../assets/levels/c2.txt?raw';

const LEVEL_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function parseLevelWords(raw: string): string[] {
  const words: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const lemma = line.trim().toLowerCase();
    if (!lemma || lemma.startsWith('#') || seen.has(lemma)) continue;
    seen.add(lemma);
    words.push(lemma);
  }
  return words;
}

const WORDS_BY_LEVEL: Record<CEFRLevel, string[]> = {
  A1: parseLevelWords(a1Raw),
  A2: parseLevelWords(a2Raw),
  B1: parseLevelWords(b1Raw),
  B2: parseLevelWords(b2Raw),
  C1: parseLevelWords(c1Raw),
  C2: parseLevelWords(c2Raw),
};

const ALL_CEFR_WORDS: string[] = (() => {
  const all: string[] = [];
  const seen = new Set<string>();
  for (const level of LEVEL_ORDER) {
    for (const lemma of WORDS_BY_LEVEL[level]) {
      if (seen.has(lemma)) continue;
      seen.add(lemma);
      all.push(lemma);
    }
  }
  return all;
})();

export function getAllCefrWords(): string[] {
  return ALL_CEFR_WORDS;
}

export function getCefrWordsUpTo(level: CEFRLevel): string[] {
  const target = level.toUpperCase() as CEFRLevel;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const current of LEVEL_ORDER) {
    for (const lemma of WORDS_BY_LEVEL[current]) {
      if (seen.has(lemma)) continue;
      seen.add(lemma);
      result.push(lemma);
    }
    if (current === target) break;
  }
  return result;
}
