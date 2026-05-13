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

export interface AnalysisSection {
  linear?: boolean | string;
  document?: Document;
  load: (request?: Function) => Promise<unknown>;
  unload?: () => void;
}

export interface AnalysisBookLike {
  ready?: Promise<unknown>;
  request?: Function;
  spine: {
    each: (callback: (section: AnalysisSection) => void) => void;
  };
  destroy?: () => void;
}

export function isLinearSection(section: AnalysisSection): boolean {
  if (section.linear === false) return false;
  if (typeof section.linear === 'string' && section.linear.toLowerCase() === 'no') return false;
  return true;
}

function toDocument(loaded: unknown, section: AnalysisSection): Document | null {
  if (section.document && (section.document as Node).nodeType === Node.DOCUMENT_NODE) {
    return section.document;
  }
  const loadedNode = loaded as Node | undefined;
  if (loadedNode && loadedNode.nodeType === Node.DOCUMENT_NODE) {
    return loaded as Document;
  }
  if (loadedNode?.ownerDocument && loadedNode.ownerDocument.nodeType === Node.DOCUMENT_NODE) {
    return loadedNode.ownerDocument;
  }
  return null;
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
  const root = doc.body ?? doc;
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
  return blocks;
}

export async function collectWholeBookAnalysisFromBook(
  analysisBook: AnalysisBookLike,
  lexemes: Record<string, LexemeEntry>,
): Promise<WholeBookAnalysis> {
  if (analysisBook.ready) {
    await analysisBook.ready;
  }

  const sections: AnalysisSection[] = [];
  analysisBook.spine.each((section: AnalysisSection) => sections.push(section));

  const allBlocks: Token[][] = [];
  const allTokens: Token[] = [];
  let scannedSections = 0;
  let failedSections = 0;

  try {
    for (const section of sections) {
      if (!isLinearSection(section)) continue;
      scannedSections++;

      try {
        const loaded = await section.load(analysisBook.request);
        const doc = toDocument(loaded, section);
        if (!doc) continue;

        const sectionBlocks = extractTokenBlocksFromDocument(doc, lexemes);
        for (const block of sectionBlocks) {
          allBlocks.push(block);
          allTokens.push(...block);
        }
      } catch {
        // Some EPUBs contain broken/missing spine resources. Skip bad sections
        // so whole-book analysis can still succeed with the remaining content.
        failedSections++;
      } finally {
        // section.unload is best-effort and should always run after each section attempt
        section.unload?.();
      }
    }
  } finally {
    analysisBook.destroy?.();
  }

  return { tokens: allTokens, blocks: allBlocks, scannedSections, failedSections };
}

export async function collectWholeBookAnalysisFromBuffer(
  buffer: ArrayBuffer,
  lexemes: Record<string, LexemeEntry>,
): Promise<WholeBookAnalysis> {
  const analysisBook = ePub(buffer) as unknown as AnalysisBookLike & {
    replacements?: () => Promise<unknown>;
  };
  // Whole-book text extraction does not need asset replacement; disabling this
  // avoids noisy failures on malformed/missing css/image references.
  if (typeof analysisBook.replacements === 'function') {
    analysisBook.replacements = () => Promise.resolve();
  }
  return collectWholeBookAnalysisFromBook(analysisBook, lexemes);
}
