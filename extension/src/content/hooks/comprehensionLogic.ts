/**
 * Pure comprehension analysis function.
 * Input: sentences (strings from page), userKnownWords (lemmas with "known" status).
 * Output: sentence-level breakdown + ranked unlock list.
 */

export interface UnlockWord {
  word: string;
  /** How many i+1 sentences become fully known if this word is learned */
  unlocks: number;
}

export interface ComprehensionResult {
  /** 0–100: unique known words / total unique words on page */
  score: number;
  levelBadge: string;
  levelColor: string;
  knownCount: number;
  iPlusOneCount: number;
  difficultCount: number;
  totalCount: number;
  /** Unknown words found in i+1 sentences, ranked by how many sentences each unlocks */
  unlockList: UnlockWord[];
}

const LEVEL_MAP: Array<{ min: number; label: string; color: string }> = [
  { min: 96, label: 'Native',      color: '#A8B693' },
  { min: 81, label: 'Advanced',    color: '#98C1D9' },
  { min: 61, label: 'Proficient',  color: '#98C1D9' },
  { min: 41, label: 'Ambitious',   color: '#A07855' },
  { min: 21, label: 'Developing',  color: '#D97762' },
  { min: 0,  label: 'Beginner',    color: '#D97762' },
];

function getLevelBadge(score: number): { label: string; color: string } {
  for (const lvl of LEVEL_MAP) {
    if (score >= lvl.min) return { label: lvl.label, color: lvl.color };
  }
  return { label: 'Beginner', color: '#D97762' };
}

export function analyzeComprehension(
  sentences: string[],
  userKnownWords: string[]
): ComprehensionResult {
  const knownSet = new Set(userKnownWords.map(w => w.toLowerCase().trim()));

  let knownCount = 0;
  let iPlusOneCount = 0;
  let difficultCount = 0;

  // word → how many i+1 sentences it is the sole unknown word in
  const unlockMap = new Map<string, number>();

  // All unique words seen on the page (for score)
  const allUnique = new Set<string>();

  for (const sentence of sentences) {
    const words = (sentence.match(/[a-zA-Z]{2,}/g) ?? []).map(w => w.toLowerCase());
    if (words.length === 0) continue;

    for (const w of words) allUnique.add(w);

    const uniqueUnknown = new Set(words.filter(w => !knownSet.has(w)));

    if (uniqueUnknown.size === 0) {
      knownCount++;
    } else if (uniqueUnknown.size === 1) {
      iPlusOneCount++;
      const word = [...uniqueUnknown][0];
      unlockMap.set(word, (unlockMap.get(word) ?? 0) + 1);
    } else {
      difficultCount++;
    }
  }

  // Score = unique known words / total unique words
  let knownUnique = 0;
  for (const w of allUnique) {
    if (knownSet.has(w)) knownUnique++;
  }
  const score = allUnique.size > 0
    ? Math.round((knownUnique / allUnique.size) * 100)
    : 0;

  const { label: levelBadge, color: levelColor } = getLevelBadge(score);

  const unlockList: UnlockWord[] = [...unlockMap.entries()]
    .map(([word, unlocks]) => ({ word, unlocks }))
    .sort((a, b) => b.unlocks - a.unlocks);

  return {
    score,
    levelBadge,
    levelColor,
    knownCount,
    iPlusOneCount,
    difficultCount,
    totalCount: sentences.length,
    unlockList,
  };
}
