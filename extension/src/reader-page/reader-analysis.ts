import ePub from 'epubjs';
import type { LexemeEntry, Token } from '../shared/types';
import { lookupFrequency } from '../shared/frequency';
import { lemmatize } from '../shared/lemmatizer';
import { tokenizeText } from '../content/parser';

const BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, td';

export interface WholeBookAnalysis {
  tokens: Token[];
  blocks: Token[][];
  scannedSections: number;
  failedSections: number;
}

function tokenizeBlock(text: string, lexemes: Record<string, LexemeEntry>): Token[] {
  const rawTokens = tokenizeText(text);
  const blockTokens: Token[] = [];
  for (const raw of rawTokens) {
    const lemma = lemmatize(raw.surface);
    const freqEntry = lookupFrequency(lemma);
    blockTokens.push({
      lemma,
      surface: raw.surface,
      frequencyRank: freqEntry?.rank,
      status: lexemes[lemma]?.status ?? 'unknown',
    });
  }
  return blockTokens;
}

export function extractTokenBlocksFromDocument(
  doc: Document,
  lexemes: Record<string, LexemeEntry>,
): Token[][] {
  const root = doc.body ?? doc.documentElement ?? doc;
  const blocks: Token[][] = [];
  const elements = root.querySelectorAll(BLOCK_SELECTOR);
  for (const element of elements) {
    if (element.parentElement?.closest(BLOCK_SELECTOR)) continue;
    const text = element.textContent?.trim() ?? '';
    if (!text) continue;
    const blockTokens = tokenizeBlock(text, lexemes);
    if (blockTokens.length > 0) {
      blocks.push(blockTokens);
    }
  }
  if (blocks.length === 0) {
    const fullText = root.textContent?.trim() ?? '';
    if (fullText) {
      const blockTokens = tokenizeBlock(fullText, lexemes);
      if (blockTokens.length > 0) {
        blocks.push(blockTokens);
      }
    }
  }
  return blocks;
}

interface SpineItemLike {
  href: string;
  linear?: string | boolean;
  idref?: string;
}

interface PackagingLike {
  spine: SpineItemLike[];
  manifest: Record<string, { href: string }>;
}

export async function collectWholeBookAnalysisFromBuffer(
  buffer: ArrayBuffer,
  lexemes: Record<string, LexemeEntry>,
): Promise<WholeBookAnalysis> {
  const book = ePub(buffer) as any;
  const allBlocks: Token[][] = [];
  const allTokens: Token[] = [];
  let scannedSections = 0;
  let failedSections = 0;

  try {
    await book.ready;

    const archive = book.archive;
    const packaging: PackagingLike | undefined = book.packaging;

    if (!archive || !packaging) {
      console.warn('[Syntagma Analysis] Book archive or packaging not available');
      return { tokens: [], blocks: [], scannedSections: 0, failedSections: 0 };
    }

    const spineItems: SpineItemLike[] = packaging.spine ?? [];
    const manifest = packaging.manifest ?? {};
    const parser = new DOMParser();

    for (const item of spineItems) {
      if (item.linear === false || (typeof item.linear === 'string' && item.linear.toLowerCase() === 'no')) {
        continue;
      }

      scannedSections++;
      const rawHref = manifest[item.idref ?? '']?.href ?? item.href;
      if (!rawHref) {
        failedSections++;
        continue;
      }

      // book.resolve() converts the manifest-relative href into the full
      // archive path that archive.getText() / archive.request() expects
      // (e.g. "chapter1.xhtml" → "/OEBPS/chapter1.xhtml").
      const resolvedUrl: string | undefined = book.resolve(rawHref);
      if (!resolvedUrl) {
        failedSections++;
        continue;
      }

      try {
        // archive.request() reads from the zip, auto-detects the file type
        // from the extension, and returns a parsed Document for xhtml/html.
        const result: Document | string = await archive.request(resolvedUrl);

        let doc: Document;
        if (result && typeof result === 'object' && 'querySelector' in result) {
          doc = result as Document;
        } else if (typeof result === 'string') {
          const isXhtml = rawHref.endsWith('.xhtml') || rawHref.endsWith('.xml');
          doc = parser.parseFromString(result, isXhtml ? 'application/xhtml+xml' : 'text/html');
          if (doc.querySelector('parsererror')) {
            doc = parser.parseFromString(result, 'text/html');
          }
        } else {
          failedSections++;
          continue;
        }

        const sectionBlocks = extractTokenBlocksFromDocument(doc, lexemes);
        for (const block of sectionBlocks) {
          allBlocks.push(block);
          allTokens.push(...block);
        }
      } catch (err) {
        console.warn('[Syntagma Analysis] Failed to process section:', rawHref, err);
        failedSections++;
      }
    }
  } catch (err) {
    console.error('[Syntagma Analysis] Book initialization failed:', err);
  } finally {
    try { book.destroy(); } catch {}
  }

  return { tokens: allTokens, blocks: allBlocks, scannedSections, failedSections };
}
