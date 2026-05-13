import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { LexemeEntry, Token, WordStatus } from '../../shared/types';
import { usePageAnalysis } from './usePageAnalysis';

function createLexeme(lemma: string, status: WordStatus): LexemeEntry {
  const now = Date.now();
  return {
    key: lemma,
    lemma,
    surface: lemma,
    type: 'word',
    status,
    seenCount: 1,
    lastSeenAt: now,
    createdAt: now,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('usePageAnalysis', () => {
  it('computes score and unknown word ranking while excluding ignored words', () => {
    const tokens: Token[] = [
      { lemma: 'known-word', surface: 'Known', status: 'unknown' },
      { lemma: 'learning-word', surface: 'Learning', status: 'unknown' },
      { lemma: 'unknown-word', surface: 'Unknown', status: 'unknown' },
      { lemma: 'unknown-word', surface: 'Unknown', status: 'unknown' },
      { lemma: 'ignored-word', surface: 'Ignored', status: 'unknown' },
    ];
    const lexemes: Record<string, LexemeEntry> = {
      'known-word': createLexeme('known-word', 'known'),
      'learning-word': createLexeme('learning-word', 'learning'),
      'ignored-word': createLexeme('ignored-word', 'ignored'),
    };

    const { result } = renderHook(() => usePageAnalysis(tokens, lexemes));

    expect(result.current.counts).toEqual({
      total: 4,
      known: 1,
      learning: 1,
      unknown: 2,
    });
    expect(result.current.comprehensionScore).toBe(38);
    expect(result.current.unknownWords).toEqual([
      {
        lemma: 'unknown-word',
        surface: 'Unknown',
        occurrences: 2,
        frequencyRank: undefined,
      },
    ]);
  });

  it('uses token blocks for i+1 when blocks are provided', () => {
    const lexemes: Record<string, LexemeEntry> = {
      known: createLexeme('known', 'known'),
      u1: createLexeme('u1', 'unknown'),
      u2: createLexeme('u2', 'unknown'),
      u3: createLexeme('u3', 'unknown'),
    };
    const blocks: Token[][] = [
      [
        { lemma: 'known', surface: 'Known', status: 'unknown' },
        { lemma: 'u1', surface: 'Unknown', status: 'unknown' },
      ],
      [
        { lemma: 'u1', surface: 'Unknown', status: 'unknown' },
        { lemma: 'u2', surface: 'Unknown', status: 'unknown' },
      ],
      [
        { lemma: 'known', surface: 'Known', status: 'unknown' },
        { lemma: 'known', surface: 'Known', status: 'unknown' },
      ],
      [
        { lemma: 'u3', surface: 'Unknown', status: 'unknown' },
        { lemma: 'u3', surface: 'Unknown', status: 'unknown' },
      ],
    ];
    const tokens = blocks.flat();

    const { result } = renderHook(() =>
      usePageAnalysis(tokens, lexemes, { blocks }),
    );

    expect(result.current.iPlusOneSentences).toBe(2);
  });

  it('falls back to DOM-based i+1 when blocks are not provided', () => {
    document.body.innerHTML = `
      <p><span data-syn="known">Known</span> <span data-syn="u1">Unknown</span></p>
      <p><span data-syn="u1">Unknown</span> <span data-syn="u2">Unknown</span></p>
    `;

    const lexemes: Record<string, LexemeEntry> = {
      known: createLexeme('known', 'known'),
      u1: createLexeme('u1', 'unknown'),
      u2: createLexeme('u2', 'unknown'),
    };
    const tokens: Token[] = [
      { lemma: 'known', surface: 'Known', status: 'unknown' },
      { lemma: 'u1', surface: 'Unknown', status: 'unknown' },
      { lemma: 'u1', surface: 'Unknown', status: 'unknown' },
      { lemma: 'u2', surface: 'Unknown', status: 'unknown' },
    ];

    const { result } = renderHook(() => usePageAnalysis(tokens, lexemes));

    expect(result.current.iPlusOneSentences).toBe(1);
  });
});
