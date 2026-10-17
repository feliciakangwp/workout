import { addDays, dateRange, toDate } from '../dates';
import { DATA_START, DEMO_TODAY } from '../../data/mockData';
import type { RecoveryDay, Workout } from '../../data/types';
import { sessionLoad } from './common';

export const dailyLoad = (workouts: Workout[]) => {
  const m = new Map<string, number>();
  for (const w of workouts) m.set(w.date, (m.get(w.date) ?? 0) + sessionLoad(w));
  return m;
};

/** Deterministic per-date jitter in [-1, 1] so soreness looks self-reported. */
const jitter = (iso: string) => {
  const x = Math.sin(toDate(iso).getTime() / 86_400_000) * 10000;
  return (x - Math.floor(x)) * 2 - 1;
};

export interface RecoveryPoint extends RecoveryDay {
  load: number;
  acuteLoad: number;
  chronicLoad: number;
  soreness: number;
  recoveryScore: number;
}

export type RecoveryStatus = { label: string; tone: 'good' | 'moderate' | 'low' };
export const recoveryStatus = (score: number): RecoveryStatus =>
  score >= 72 ? { label: 'Well recovered', tone: 'good' } : score >= 55 ? { label: 'Moderate', tone: 'moderate' } : { label: 'Needs rest', tone: 'low' };

/**
 * Merges sample wellness metrics with training load computed from workouts.
 * Soreness (1–10) is modelled from the previous two days' load so newly
 * logged workouts feed into recovery immediately.
 */
export function recoverySeries(recovery: RecoveryDay[], workouts: Workout[], today = DEMO_TODAY): RecoveryPoint[] {
  const load = dailyLoad(workouts);
  const byDate = new Map(recovery.map((r) => [r.date, r]));
  const hrvValues = recovery.map((r) => r.hrv);
  return dateRange(DATA_START, today)
    .filter((d) => byDate.has(d))
    .map((date) => {
      const r = byDate.get(date)!;
      const l = (offset: number) => load.get(addDays(date, -offset)) ?? 0;
      const acuteLoad = dateRange(addDays(date, -6), date).reduce((a, d) => a + (load.get(d) ?? 0), 0);
      const chronicLoad = Math.round(dateRange(addDays(date, -27), date).reduce((a, d) => a + (load.get(d) ?? 0), 0) / 4);
      const soreness = Math.min(10, Math.max(1, Math.round(1 + l(1) / 170 + l(2) / 400 + jitter(date))));
      const idx = recovery.indexOf(r);
      const window = hrvValues.slice(Math.max(0, idx - 28), idx + 1);
      const hrvBaseline = window.reduce((a, b) => a + b, 0) / window.length;
      const hrvScore = Math.min(100, Math.max(0, 60 + (r.hrv / hrvBaseline - 1) * 300));
      const recoveryScore = Math.round(0.3 * r.sleepScore + 0.3 * r.bodyBattery + 0.2 * hrvScore + 0.2 * (100 - (soreness - 1) * 11));
      return { ...r, load: l(0), acuteLoad, chronicLoad, soreness, recoveryScore };
    });
}
