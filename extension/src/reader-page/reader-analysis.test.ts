import { describe, expect, it, vi } from 'vitest';
import type { LexemeEntry, WordStatus } from '../shared/types';
import {
  collectWholeBookAnalysisFromBook,
  extractTokenBlocksFromDocument,
  isLinearSection,
  type AnalysisSection,
} from './reader-analysis';

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

function createSection(linear: boolean | string | undefined, html: string) {
  const section: AnalysisSection = {
    linear,
    document: undefined,
    load: vi.fn(async () => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      section.document = doc;
      return doc.documentElement;
    }),
    unload: vi.fn(() => {
      section.document = undefined;
    }),
  };
  return section;
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

  it('collects whole-book tokens from linear spine sections and destroys the analysis book', async () => {
    const section1 = createSection(true, '<html><body><p>Known Alpha</p></body></html>');
    const section2 = createSection('no', '<html><body><p>Skipped Words</p></body></html>');
    const section3 = createSection(undefined, '<html><body><p>Beta</p><p>Beta</p></body></html>');
    const destroy = vi.fn();

    const result = await collectWholeBookAnalysisFromBook(
      {
        ready: Promise.resolve(),
        request: vi.fn(),
        spine: {
          each: (callback) => {
            [section1, section2, section3].forEach(callback);
          },
        },
        destroy,
      },
      {
        known: createLexeme('known', 'known'),
      },
    );

    expect(isLinearSection(section2)).toBe(false);
    expect(section1.load).toHaveBeenCalledTimes(1);
    expect(section2.load).toHaveBeenCalledTimes(0);
    expect(section3.load).toHaveBeenCalledTimes(1);
    expect(section1.unload).toHaveBeenCalledTimes(1);
    expect(section3.unload).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(result.blocks).toHaveLength(3);
    expect(result.tokens).toHaveLength(4);
    expect(result.scannedSections).toBe(2);
    expect(result.failedSections).toBe(0);
  });

  it('continues analysis when a section load fails and still unloads/destroys', async () => {
    const section: AnalysisSection = {
      linear: true,
      load: vi.fn(async () => {
        throw new Error('load failed');
      }),
      unload: vi.fn(),
    };
    const okSection = createSection(true, '<html><body><p>Alpha</p></body></html>');
    const destroy = vi.fn();

    const result = await collectWholeBookAnalysisFromBook(
      {
        ready: Promise.resolve(),
        request: vi.fn(),
        spine: {
          each: (callback) => {
            callback(section);
            callback(okSection);
          },
        },
        destroy,
      },
      {},
    );

    expect(section.unload).toHaveBeenCalledTimes(1);
    expect(okSection.unload).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(result.tokens).toHaveLength(1);
    expect(result.scannedSections).toBe(2);
    expect(result.failedSections).toBe(1);
  });
});
