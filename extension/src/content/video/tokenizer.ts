import { lemmatize } from '../../shared/lemmatizer';

export interface TextToken {
  text: string;
  isWord: boolean;
  lemmas?: string[];
}

// Normalize all apostrophe-like Unicode chars to ASCII apostrophe
const APOSTROPHE_RE = /[‘’‚‛′ʹʼʻ`]/g;
function normalizeApostrophes(s: string): string {
  return s.replace(APOSTROPHE_RE, "'");
}

// Human-readable expansion for display in popups
export const CONTRACTION_EXPANSIONS: Record<string, string> = {
  "i'm": "I am", "i'll": "I will", "i've": "I have", "i'd": "I would",
  "it's": "it is", "that's": "that is", "what's": "what is",
  "there's": "there is", "here's": "here is", "who's": "who is",
  "he's": "he is", "she's": "she is", "let's": "let us",
  "won't": "will not", "can't": "cannot", "don't": "do not",
  "doesn't": "does not", "didn't": "did not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
  "wouldn't": "would not", "couldn't": "could not", "shouldn't": "should not",
  "they're": "they are", "we're": "we are", "you're": "you are",
  "they've": "they have", "we've": "we have", "you've": "you have",
  "they'll": "they will", "we'll": "we will", "you'll": "you will",
  "they'd": "they would", "we'd": "we would", "you'd": "you would",
};

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

// Suffix-only fallback: if tokenizer splits a contraction (e.g. "I" + "'ve"),
// map the orphaned suffix to its full-word lemma so it inherits known status.
const CONTRACTION_SUFFIXES: Record<string, string[]> = {
  "'m": ['be'], "'re": ['be'], "'s": ['be'],
  "'ve": ['have'], "'ll": ['will'], "'d": ['would'],
  "n't": ['not'],
};

export function tokenize(text: string): TextToken[] {
  const norm = normalizeApostrophes(text);
  const raw = norm
    .split(/(\b[a-zA-Z']+\b)/)
    .filter(p => p.length > 0);

  const out: TextToken[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    const normalized = p.replace(/'/g, "'").toLowerCase();
    const expansion = CONTRACTIONS[normalized];
    if (expansion) {
      out.push({ text: p, isWord: true, lemmas: expansion });
      continue;
    }

    // Handle orphaned suffix: if previous token was a word and this starts
    // with an apostrophe, try to merge or map the suffix.
    if (normalized.startsWith("'") && normalized.length > 1) {
      const suffixLemmas = CONTRACTION_SUFFIXES[normalized];
      if (suffixLemmas) {
        // Try to merge with previous word token for a contraction lookup
        const prev = out.length > 0 ? out[out.length - 1] : null;
        if (prev && prev.isWord) {
          const merged = (prev.text + p).replace(/'/g, "'").toLowerCase();
          const mergedNorm = normalizeApostrophes(merged).toLowerCase();
          const mergedExpansion = CONTRACTIONS[mergedNorm];
          if (mergedExpansion) {
            prev.text = prev.text + p;
            prev.lemmas = mergedExpansion;
            continue;
          }
        }
        out.push({ text: p, isWord: true, lemmas: suffixLemmas });
        continue;
      }
    }

    if (/^[a-zA-Z']+$/.test(p)) {
      const lower = normalized.replace(/'/g, "'");
      if (lower.endsWith("'s") && lower.length > 2) {
        const base = lower.slice(0, -2);
        const baseLemma = lemmatize(base);
        const lemmas = baseLemma !== base ? [baseLemma, base, 'be'] : [base, 'be'];
        out.push({ text: p, isWord: true, lemmas });
      } else {
        const lemma = lemmatize(lower);
        out.push({
          text: p,
          isWord: true,
          lemmas: lemma !== lower ? [lemma, lower] : undefined,
        });
      }
    } else {
      out.push({ text: p, isWord: false });
    }
  }
  return out;
}
