/** Rest between strength sets (and before the next exercise's first set). */
export const STRENGTH_REST_SEC = 120;

export interface StrengthSetPlan {
  sets: number;
  reps?: number;
  weightKg?: number;
  /** Timed holds (e.g. plank): the hold is the work. */
  durationSec?: number;
  /** Heaviest weight the athlete has logged for this exercise. */
  bestKg?: number;
}

/**
 * Time under work for one set: 1 to 2 minutes, longer the heavier it is for the athlete
 * (its weight against their best for the exercise; 5 reps or fewer counts as heavy).
 */
export function strengthSetSec(s: StrengthSetPlan): number {
  if (s.durationSec) return s.durationSec;
  if (s.reps !== undefined && s.reps <= 5) return 120;
  if (!s.weightKg || !s.bestKg) return 60;
  const ratio = s.weightKg / s.bestKg; // 60% of best or lighter: 1 min; at best or heavier: 2 min
  return 60 + 60 * Math.min(1, Math.max(0, (ratio - 0.6) / 0.4));
}

/** Estimated strength session: every set's work plus 2 minutes rest between sets. */
export function strengthSessionSec(items: StrengthSetPlan[]): number {
  const totalSets = items.reduce((a, s) => a + Math.max(0, s.sets), 0);
  if (!totalSets) return 0;
  const work = items.reduce((a, s) => a + Math.max(0, s.sets) * strengthSetSec(s), 0);
  return work + STRENGTH_REST_SEC * (totalSets - 1);
}
