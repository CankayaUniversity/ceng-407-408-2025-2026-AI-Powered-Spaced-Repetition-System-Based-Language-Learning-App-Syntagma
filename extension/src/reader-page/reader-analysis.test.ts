import { describe, expect, it } from 'vitest';
import type { WordStatus } from '../shared/types';
import type { LexemeEntry } from '../shared/types';
import { extractTokenBlocksFromDocument } from './reader-analysis';

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

describe('reader-analysis', () => {
  it('extracts token blocks from supported block elements only', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><p>Alpha Beta</p><li><p>Gamma</p></li><script>Skipped</script></body></html>',
      'text/html',
    );

    const blocks = extractTokenBlocksFromDocument(doc, {});

    expect(blocks).toHaveLength(2);
    expect(blocks[0].map(token => token.surface)).toEqual(['Alpha', 'Beta']);
    expect(blocks[1].map(token => token.surface)).toEqual(['Gamma']);
  });

  it('falls back to full text extraction when no block elements found', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body>Hello World Outside</body></html>',
      'text/html',
    );

    const blocks = extractTokenBlocksFromDocument(doc, {});

    expect(blocks).toHaveLength(1);
    expect(blocks[0].map(token => token.surface)).toEqual(['Hello', 'World', 'Outside']);
  });

  it('applies lexeme status to extracted tokens', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><p>Known Alpha Beta</p></body></html>',
      'text/html',
    );

    const lexemes = { known: createLexeme('known', 'known') };
    const blocks = extractTokenBlocksFromDocument(doc, lexemes);

    expect(blocks).toHaveLength(1);
    const knownToken = blocks[0].find(t => t.lemma === 'known');
    expect(knownToken?.status).toBe('known');
    const unknownToken = blocks[0].find(t => t.surface === 'Alpha');
    expect(unknownToken?.status).toBe('unknown');
  });
});
