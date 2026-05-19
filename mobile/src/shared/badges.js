export const CEFR_LEVELS = [
  { id: 'A1', label: 'A1', threshold: 500 },
  { id: 'A2', label: 'A2', threshold: 1000 },
  { id: 'B1', label: 'B1', threshold: 2000 },
  { id: 'B2', label: 'B2', threshold: 4000 },
  { id: 'C1', label: 'C1', threshold: 8000 },
  { id: 'C2', label: 'C2', threshold: 12000 },
];

const MEDALS = {
  bronze: { id: 'bronze', label: 'Bronze', image: require('../../assets/Bronze.png') },
  silver: { id: 'silver', label: 'Silver', image: require('../../assets/Silver.png') },
  gold: { id: 'gold', label: 'Gold', image: require('../../assets/Gold.png') },
};

export function getCefrMedal(levelId) {
  switch (levelId) {
    case 'A1':
    case 'A2':
      return MEDALS.bronze;
    case 'B1':
    case 'B2':
      return MEDALS.silver;
    case 'C1':
    case 'C2':
      return MEDALS.gold;
    default:
      return null;
  }
}

export function computeCefrState(knownWords) {
  const count = Number.isFinite(knownWords) ? knownWords : 0;
  const currentLevel = [...CEFR_LEVELS].reverse().find((level) => count >= level.threshold) ?? null;
  const nextLevel = CEFR_LEVELS.find((level) => count < level.threshold) ?? null;
  const base = currentLevel?.threshold ?? 0;
  const top = nextLevel?.threshold ?? CEFR_LEVELS[CEFR_LEVELS.length - 1].threshold;
  const progress = nextLevel ? Math.min((count - base) / (top - base), 1) : 1;
  const progressPercent = Math.round(progress * 100);
  const remaining = nextLevel ? Math.max(nextLevel.threshold - count, 0) : 0;
  const progressText = nextLevel
    ? `${count} / ${nextLevel.threshold} words to ${nextLevel.label}`
    : `${count} words — C2 unlocked!`;

  return {
    knownWords: count,
    currentLevel,
    nextLevel,
    progress,
    progressPercent,
    remaining,
    progressText,
  };
}
