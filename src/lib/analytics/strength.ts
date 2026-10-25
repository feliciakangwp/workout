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

/** Sessions of one weighted exercise; `strengthOnly` keeps just Strength workouts. */
export function liftHistory(workouts: Workout[], name: string, strengthOnly = false): LiftSession[] {
  const byDate = new Map<string, LiftSession>();
  for (const w of workouts) {
    if (strengthOnly && w.type !== 'Strength') continue;
    for (const e of w.exercises) {
      // Lifts are rep sets; timed or distance work with a weight isn't a lift.
      if (e.name !== name || !e.weightKg || (e.mode && e.mode !== 'reps')) continue;
      const s: LiftSession = {
        date: w.date,
        workoutId: w.id,
        weightKg: e.weightKg,
        sets: e.sets,
        reps: e.reps ?? 0,
        volume: e.sets * (e.reps ?? 0) * e.weightKg,
        e1rm: Math.round(e1rm(e.weightKg, e.reps ?? 0) * 10) / 10,
      };
      const prev = byDate.get(w.date);
      if (!prev || s.weightKg > prev.weightKg) byDate.set(w.date, prev ? { ...s, volume: s.volume + prev.volume } : s);
    }
  }
  return sortByDate([...byDate.values()]);
}

/**
 * Exercises the athlete has done with weights in Strength workouts, most
 * recently trained first: nothing is tracked until it has been logged.
 */
export function strengthExercises(workouts: Workout[]): string[] {
  const last = new Map<string, string>();
  for (const w of workouts) {
    if (w.type !== 'Strength') continue;
    for (const e of w.exercises) if (e.weightKg && (last.get(e.name) ?? '') < w.date) last.set(e.name, w.date);
  }
  return [...last.entries()].sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0])).map(([name]) => name);
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

export function liftSummary(workouts: Workout[], name: string, strengthOnly = false): LiftSummary {
  const history = liftHistory(workouts, name, strengthOnly);
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  const first = history[0];
  const pr = history.reduce<LiftSession | undefined>((best, s) => (!best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps) ? s : best), undefined);
  const pct = (a?: LiftSession, b?: LiftSession) => (a && b ? ((liftStrength(a) - liftStrength(b)) / liftStrength(b)) * 100 : 0);
  return { name, history, latest, previous, pr, changeSinceStartPct: pct(latest, first), changeVsPreviousPct: pct(latest, previous) };
}

/**
 * Strength index on a given date: mean of each strength exercise's most recent
 * strength relative to its first recorded session (100 = baseline).
 */
export function strengthIndexAt(workouts: Workout[], date: string): number | null {
  const ratios: number[] = [];
  for (const name of strengthExercises(workouts)) {
    const h = liftHistory(workouts, name, true);
    const upTo = h.filter((s) => s.date <= date);
    if (!h.length || !upTo.length) continue;
    ratios.push(liftStrength(upTo[upTo.length - 1]) / liftStrength(h[0]));
  }
  if (!ratios.length) return null;
  return Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 1000) / 10;
}
