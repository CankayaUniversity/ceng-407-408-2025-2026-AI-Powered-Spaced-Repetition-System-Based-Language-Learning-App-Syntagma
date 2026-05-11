export const BADGE_TIERS = [
  { id: 'bronze', label: 'Bronze', threshold: 25,  image: require('../../assets/Bronze.png') },
  { id: 'silver', label: 'Silver', threshold: 50,  image: require('../../assets/Silver.png') },
  { id: 'gold',   label: 'Gold',   threshold: 100, image: require('../../assets/Gold.png') },
];

export function computeBadgeState(totalReviews) {
  const n = Number.isFinite(totalReviews) ? totalReviews : 0;
  const unlockedIds = BADGE_TIERS.filter(t => n >= t.threshold).map(t => t.id);
  const currentTier = [...BADGE_TIERS].reverse().find(t => n >= t.threshold) ?? null;
  const nextTier    = BADGE_TIERS.find(t => n < t.threshold) ?? null;
  const base        = currentTier?.threshold ?? 0;
  const top         = nextTier?.threshold ?? BADGE_TIERS[BADGE_TIERS.length - 1].threshold;
  const progress    = nextTier ? Math.min((n - base) / (top - base), 1) : 1;
  const progressText = nextTier
    ? `${n} / ${nextTier.threshold} reviews to ${nextTier.label}`
    : `${n} reviews — all badges unlocked!`;
  return { currentTier, nextTier, progress, progressText, unlockedIds };
}
