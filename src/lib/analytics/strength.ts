import { TRACKED_LIFTS } from '../../data/exercises';
import type { Workout } from '../../data/types';
import { sortByDate } from './common';

export interface LiftSession {
  date: string;
  workoutId: string;
  weightKg: number;
  sets: number;
  reps: number;
  volume: number;
  e1rm: number;
}

/** Epley estimated one-rep max. */
export const e1rm = (weight: number, reps: number) => weight * (1 + reps / 30);

/** Strength measure used for progression: e1RM, or load per hand for carries. */
export const liftStrength = (s: LiftSession) => (s.reps > 20 ? s.weightKg : s.e1rm);

export function liftHistory(workouts: Workout[], name: string): LiftSession[] {
  const byDate = new Map<string, LiftSession>();
  for (const w of workouts)
    for (const e of w.exercises) {
      if (e.name !== name || !e.weightKg) continue;
      const s: LiftSession = {
        date: w.date,
        workoutId: w.id,
        weightKg: e.weightKg,
        sets: e.sets,
        reps: e.reps,
        volume: e.sets * e.reps * e.weightKg,
        e1rm: Math.round(e1rm(e.weightKg, e.reps) * 10) / 10,
      };
      const prev = byDate.get(w.date);
      if (!prev || s.weightKg > prev.weightKg) byDate.set(w.date, prev ? { ...s, volume: s.volume + prev.volume } : s);
    }
  return sortByDate([...byDate.values()]);
}

export interface LiftSummary {
  name: string;
  history: LiftSession[];
  latest?: LiftSession;
  previous?: LiftSession;
  pr?: LiftSession;
  changeSinceStartPct: number;
  changeVsPreviousPct: number;
}

export function liftSummary(workouts: Workout[], name: string): LiftSummary {
  const history = liftHistory(workouts, name);
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  const first = history[0];
  const pr = history.reduce<LiftSession | undefined>((best, s) => (!best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps) ? s : best), undefined);
  const pct = (a?: LiftSession, b?: LiftSession) => (a && b ? ((liftStrength(a) - liftStrength(b)) / liftStrength(b)) * 100 : 0);
  return { name, history, latest, previous, pr, changeSinceStartPct: pct(latest, first), changeVsPreviousPct: pct(latest, previous) };
}

/**
 * Strength index on a given date: mean of each tracked lift's most recent strength
 * relative to its first recorded session (100 = baseline).
 */
export function strengthIndexAt(workouts: Workout[], date: string): number | null {
  const ratios: number[] = [];
  for (const name of TRACKED_LIFTS) {
    const h = liftHistory(workouts, name);
    const upTo = h.filter((s) => s.date <= date);
    if (!h.length || !upTo.length) continue;
    ratios.push(liftStrength(upTo[upTo.length - 1]) / liftStrength(h[0]));
  }
  if (!ratios.length) return null;
  return Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 1000) / 10;
}
