import { entryMeasure } from '../../data/exercises';
import type { Workout } from '../../data/types';

/** Personal records a newly logged workout sets against everything logged before it. */
export interface Records {
  longest?: { km: number; previousKm: number };
  fastest?: { paceSecPerKm: number; previousPace: number; km: number };
  heaviest: { name: string; kg: number; previousKg: number }[];
}

/** Pure runs (walks aren't runs), each with its distance and average pace. */
const pureRuns = (ws: Workout[]) => ws.filter((w) => w.type === 'Running' && w.run && w.run.kind !== 'Walking' && w.run.distanceKm > 0).map((w) => w.run!);

/** Lifts: weighted rep sets, not timed or distance work. */
const lifts = (w: Pick<Workout, 'exercises'>) => w.exercises.filter((e) => e.weightKg && (!e.mode || e.mode === 'reps') && entryMeasure(e) === 'weight');

/**
 * Records set by `w` compared with `previous` workouts (logged ones only, not planned or
 * assumed). A record needs an earlier result to beat, so a first-ever run or lift isn't one.
 * Fastest pace counts runs of 1 km or more.
 */
export function newRecords(w: Omit<Workout, 'id' | 'isSample'>, previous: Workout[]): Records {
  const before = previous.filter((x) => !x.fromPlan && !x.assumedExercises);
  const out: Records = { heaviest: [] };
  const run = w.type === 'Running' && w.run && w.run.kind !== 'Walking' ? w.run : undefined;
  if (run) {
    const runs = pureRuns(before);
    const longest = Math.max(0, ...runs.map((r) => r.distanceKm));
    if (longest > 0 && run.distanceKm > longest) out.longest = { km: run.distanceKm, previousKm: longest };
    const timed = runs.filter((r) => r.distanceKm >= 1 && r.paceSecPerKm > 0);
    if (timed.length && run.distanceKm >= 1) {
      const fastest = Math.min(...timed.map((r) => r.paceSecPerKm));
      if (run.paceSecPerKm < fastest) out.fastest = { paceSecPerKm: run.paceSecPerKm, previousPace: fastest, km: run.distanceKm };
    }
  }
  if (w.type === 'Strength') {
    const best = new Map<string, number>();
    for (const x of before) for (const e of lifts(x)) best.set(e.name, Math.max(best.get(e.name) ?? 0, e.weightKg!));
    const seen = new Set<string>();
    for (const e of lifts(w)) {
      const prev = best.get(e.name);
      if (prev && e.weightKg! > prev && !seen.has(e.name)) {
        seen.add(e.name);
        const kg = Math.max(...lifts(w).filter((x) => x.name === e.name).map((x) => x.weightKg!));
        out.heaviest.push({ name: e.name, kg, previousKg: prev });
      }
    }
  }
  return out;
}

export const hasRecords = (r: Records) => !!(r.longest || r.fastest || r.heaviest.length);
