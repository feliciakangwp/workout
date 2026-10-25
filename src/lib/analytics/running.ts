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

export interface RunPrediction {
  sec: number;
  /** The run it is predicted from. */
  from: RunRecord;
}

/**
 * Time for `km` predicted (Riegel) from the athlete's best pure run: runs of 3 km
 * or more (any length from 1 km for goals shorter than 3 km).
 */
export function predictFromBestRun(workouts: Workout[], km: number, today: string): RunPrediction | null {
  if (!(km > 0)) return null;
  const minKm = Math.min(3, km);
  let best: RunPrediction | null = null;
  for (const r of runs(workouts))
    if (r.source === 'Running' && r.date <= today && r.distanceKm >= minKm && r.durationSec > 0) {
      const sec = predictTime(r.durationSec, r.distanceKm, km);
      if (!best || sec < best.sec) best = { sec, from: r };
    }
  return best;
}

/** Running goal distances to pick from; any distance from 1 to 42.2 km can be typed. */
export const GOAL_DISTANCES = [
  { km: 1, label: '1K' },
  { km: 5, label: '5K' },
  { km: 10, label: '10K' },
  { km: 21.0975, label: 'Half marathon' },
  { km: 42.195, label: 'Marathon' },
];

/** "10K", "Half marathon", or "7.5 km". */
export const goalDistanceLabel = (km: number) => GOAL_DISTANCES.find((d) => Math.abs(d.km - km) < 0.01)?.label ?? `${Math.round(km * 100) / 100} km`;
