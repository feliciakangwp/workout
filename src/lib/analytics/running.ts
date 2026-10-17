import { addDays, startOfWeek } from '../dates';
import type { RunData, Workout } from '../../data/types';
import { sortByDate, workoutsBetween } from './common';

export interface RunRecord extends RunData {
  date: string;
  workoutId: string;
  source: Workout['type'];
  durationSec: number;
}

export function runs(workouts: Workout[]): RunRecord[] {
  return sortByDate(
    workouts
      .filter((w) => w.run && w.run.distanceKm > 0)
      .map((w) => ({ ...w.run!, date: w.date, workoutId: w.id, source: w.type, durationSec: w.run!.distanceKm * w.run!.paceSecPerKm })),
  );
}

export const totalKm = (rs: RunRecord[]) => Math.round(rs.reduce((a, r) => a + r.distanceKm, 0) * 10) / 10;

/** Distance-weighted average pace. */
export const avgPace = (rs: RunRecord[]) => {
  const km = rs.reduce((a, r) => a + r.distanceKm, 0);
  return km ? rs.reduce((a, r) => a + r.durationSec, 0) / km : 0;
};

/** Distance-weighted average heart rate over runs that recorded one. */
export const avgHr = (rs: RunRecord[]) => {
  const withHr = rs.filter((r) => r.avgHr);
  const km = withHr.reduce((a, r) => a + r.distanceKm, 0);
  return km ? Math.round(withHr.reduce((a, r) => a + r.avgHr! * r.distanceKm, 0) / km) : 0;
};

/** Best average pace over a run of at least 5 km (standalone runs only). */
export const best5kPace = (rs: RunRecord[]) => {
  const eligible = rs.filter((r) => r.distanceKm >= 5 && r.source === 'Running');
  return eligible.length ? Math.min(...eligible.map((r) => r.paceSecPerKm)) : 0;
};

/** Riegel prediction of race time from a known performance. */
export const predictTime = (timeSec: number, fromKm: number, toKm: number) => timeSec * Math.pow(toKm / fromKm, 1.06);

export function weeklyKm(workouts: Workout[], from: string, to: string) {
  const out: { week: string; km: number; runs: number }[] = [];
  for (let w = startOfWeek(from); w <= to; w = addDays(w, 7)) {
    const rs = runs(workoutsBetween(workouts, w, addDays(w, 6)));
    out.push({ week: w, km: totalKm(rs), runs: rs.length });
  }
  return out;
}
