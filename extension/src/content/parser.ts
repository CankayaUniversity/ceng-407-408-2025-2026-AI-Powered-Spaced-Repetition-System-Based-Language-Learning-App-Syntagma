import type { Token, WordStatus } from '../shared/types';
import { lemmatize } from '../shared/lemmatizer';
import { lookupFrequency, getFrequencyBand } from '../shared/frequency';

// Elements to skip during DOM walking
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'TEXTAREA', 'INPUT',
  'SELECT', 'BUTTON', 'IFRAME', 'OBJECT', 'EMBED', 'CANVAS', 'SVG',
  'MATH', 'HEAD', 'META', 'LINK', 'BASE', 'TITLE',
  'syntagma-word', 'syntagma-header', 'syntagma-popup',
]);

// Minimum word length to process
const MIN_WORD_LENGTH = 2;

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

function resolveContractionStatus(
  surface: string,
  lexemes: Record<string, { status: WordStatus }>,
): WordStatus | null {
  const normalized = surface.toLowerCase().replace(/['']/g, "'");
  const parts = CONTRACTIONS[normalized];
  if (!parts) return null;
  const statuses = parts.map(l => lexemes[l]?.status ?? 'unknown');
  if (statuses.includes('unknown')) return 'unknown';
  if (statuses.includes('learning')) return 'learning';
  return 'known';
}

// Only process tokens that look like English words (latin alphabet)
const ENGLISH_WORD_RE = /^[a-zA-Z]{2,}(?:[''][a-zA-Z]+)?$/;

export interface ParseResult {
  tokens: Token[];
  textNodes: Array<{ node: Text; tokens: Token[] }>;
}

function shouldSkipNode(node: Node): boolean {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    if (SKIP_TAGS.has(el.tagName)) return true;
    // Skip hidden elements
    try {
      const style = window.getComputedStyle(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
    } catch (e) {
      // Ignore errors when querying styles for certain elements (e.g. detached nodes or iframes)
    }
    // Skip syntagma-injected elements
    if (el.hasAttribute('data-syntagma')) return true;
  }
  return false;
}

function getSentenceContext(textNode: Text): string {
  // Walk up to find containing block element and extract text
  let el: Node | null = textNode.parentElement;
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    const tag = (el as Element).tagName;
    if (['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
      return (el as Element).textContent?.slice(0, 500) ?? '';
    }
    el = el.parentElement;
  }
  return textNode.textContent ?? '';
}

export function tokenizeText(text: string): Array<{ surface: string; startOffset: number; endOffset: number }> {
  const tokens: Array<{ surface: string; startOffset: number; endOffset: number }> = [];
  // Match word tokens (including apostrophes for contractions like "don't")
  const wordRe = /[a-zA-Z]{2,}(?:[''][a-zA-Z]+)?/g;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(text)) !== null) {
    const surface = match[0];
    if (surface.length >= MIN_WORD_LENGTH && ENGLISH_WORD_RE.test(surface)) {
      tokens.push({
        surface,
        startOffset: match.index,
        endOffset: match.index + surface.length,
      });
    }
  }
  return tokens;
}

export async function parsePage(
  lexemes: Record<string, { status: WordStatus }>,
  onProgress?: (processed: number, total: number) => void
): Promise<ParseResult> {
  const allTokens: Token[] = [];
  const textNodeMap: Array<{ node: Text; tokens: Token[] }> = [];

  // Collect all text nodes using TreeWalker
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE && shouldSkipNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node as Text).textContent ?? '';
          if (text.trim().length < MIN_WORD_LENGTH) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  const textNodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      textNodes.push(current as Text);
    }
    current = walker.nextNode();
  }

  const total = textNodes.length;
  let processed = 0;

  // Process in chunks using requestIdleCallback
  const CHUNK_SIZE = 50;

  async function processChunk(startIdx: number): Promise<void> {
    const endIdx = Math.min(startIdx + CHUNK_SIZE, textNodes.length);

    for (let i = startIdx; i < endIdx; i++) {
      const textNode = textNodes[i];
      const text = textNode.textContent ?? '';
      const rawTokens = tokenizeText(text);

      if (rawTokens.length === 0) {
        processed++;
        continue;
      }

      const nodeTokens: Token[] = [];

      for (const raw of rawTokens) {
        const lemma = lemmatize(raw.surface);
        const freqEntry = lookupFrequency(lemma);
        const contractionStatus = resolveContractionStatus(raw.surface, lexemes);

        const token: Token = {
          lemma,
          surface: raw.surface,
          frequencyRank: freqEntry?.rank,
          frequencyBand: freqEntry ? getFrequencyBand(freqEntry.rank) : undefined,
          zipfScore: freqEntry?.zipf,
          status: contractionStatus ?? (lexemes[lemma]?.status) ?? 'unknown',
          node: textNode,
          startOffset: raw.startOffset,
          endOffset: raw.endOffset,
        };

        nodeTokens.push(token);
        allTokens.push(token);
      }

      if (nodeTokens.length > 0) {
        textNodeMap.push({ node: textNode, tokens: nodeTokens });
      }

      processed++;
    }

    onProgress?.(processed, total);

    if (endIdx < textNodes.length) {
      await new Promise<void>(resolve => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => resolve(), { timeout: 100 });
        } else {
          setTimeout(resolve, 0);
        }
      });
      await processChunk(endIdx);
    }
  }

  await processChunk(0);

  // (lemmatize is synchronous — no background pass needed)

  return { tokens: allTokens, textNodes: textNodeMap };
}

export function tokenizeSubtitleTexts(
  texts: string[],
  lexemes: Record<string, { status: WordStatus }>,
): Token[] {
  const allTokens: Token[] = [];
  for (const text of texts) {
    const rawTokens = tokenizeText(text);
    for (const raw of rawTokens) {
      const lemma = lemmatize(raw.surface);
      const freqEntry = lookupFrequency(lemma);
      const contractionStatus = resolveContractionStatus(raw.surface, lexemes);
      allTokens.push({
        lemma,
        surface: raw.surface,
        frequencyRank: freqEntry?.rank,
        frequencyBand: freqEntry ? getFrequencyBand(freqEntry.rank) : undefined,
        zipfScore: freqEntry?.zipf,
        status: contractionStatus ?? (lexemes[lemma]?.status) ?? 'unknown',
      });
    }
  }
  return allTokens;
}

export function extractSentence(textNode: Text, wordOffset: number): string {
  const fullText = getSentenceContext(textNode);
  // Find sentence boundaries around the word position
  const sentences = fullText.match(/[^.!?]+[.!?]*/g) ?? [fullText];
  // Return the sentence that contains the approximate position
  let charCount = 0;
  for (const sentence of sentences) {
    charCount += sentence.length;
    if (charCount >= wordOffset) {
      return sentence.trim();
    }
  }
  return sentences[0]?.trim() ?? fullText.slice(0, 200);
}
