import { lemmatize } from '../../shared/lemmatizer';

export interface TextToken {
  text: string;
  isWord: boolean;
  lemmas?: string[];
}

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

export function tokenize(text: string): TextToken[] {
  const raw = text
    .split(/(\b[a-zA-Z''']+\b)/)
    .filter(p => p.length > 0);

  const out: TextToken[] = [];
  for (const p of raw) {
    const normalized = p.replace(/['']/g, "'").toLowerCase();
    const expansion = CONTRACTIONS[normalized];
    if (expansion) {
      out.push({ text: p, isWord: true, lemmas: expansion });
    } else if (/^[a-zA-Z''']+$/.test(p)) {
      const lower = normalized.replace(/'/g, "'");
      // For words ending in 's not in the contractions map (e.g. "something's",
      // "everyone's"), include the base form so status inherits from the root.
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
