import { addDays, dateRange, startOfWeek } from '../dates';
import { DEMO_TODAY } from '../../data/mockData';
import type { Workout } from '../../data/types';

export type RangeKey = '7d' | '30d' | '90d';
export const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };

export const rangeStart = (range: RangeKey, today = DEMO_TODAY) => addDays(today, -(RANGE_DAYS[range] - 1));

export const inRange = (w: { date: string }, from: string, to: string) => w.date >= from && w.date <= to;

export const sortByDate = <T extends { date: string }>(items: T[]) =>
  [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

export interface Bucket {
  key: string;
  label: string;
  from: string;
  to: string;
}

/** Daily buckets for 7d / 30d, weekly buckets (Mon–Sun) for 90d. */
export function buildBuckets(range: RangeKey, today = DEMO_TODAY): Bucket[] {
  const from = rangeStart(range, today);
  if (range !== '90d') {
    return dateRange(from, today).map((d) => ({ key: d, label: d, from: d, to: d }));
  }
  const buckets: Bucket[] = [];
  for (let w = startOfWeek(from); w <= today; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    buckets.push({ key: w, label: w, from: w < from ? from : w, to: end > today ? today : end });
  }
  return buckets;
}

/** Session load (sRPE): duration × RPE. */
export const sessionLoad = (w: Workout) => w.durationMin * w.intensity;

export const workoutsBetween = (workouts: Workout[], from: string, to: string) =>
  workouts.filter((w) => inRange(w, from, to));
