import { STATIONS, STATION_BY_ID } from '../../data/stations';
import type { StationId, Workout } from '../../data/types';
import { sortByDate } from './common';

export interface StationAttempt {
  date: string;
  workoutId: string;
  /** Full-distance time; scaled up from half / ¾ sims. */
  timeSec: number;
  /** Time actually recorded. */
  rawSec: number;
  fraction: number;
  score: number;
}

/** Station score: 100 = example target time. Capped at 120. */
export const stationScore = (id: StationId, timeSec: number) =>
  Math.min(120, Math.round((STATION_BY_ID[id].targetSec / timeSec) * 100));

export function stationHistory(workouts: Workout[], id: StationId): StationAttempt[] {
  const out: StationAttempt[] = [];
  for (const w of workouts)
    for (const s of w.stations ?? [])
      if (s.station === id) {
        const fraction = s.fraction ?? 1;
        const timeSec = Math.round(s.timeSec / fraction);
        out.push({ date: w.date, workoutId: w.id, timeSec, rawSec: s.timeSec, fraction, score: stationScore(id, timeSec) });
      }
  return sortByDate(out);
}

export interface StationSummary {
  id: StationId;
  name: string;
  history: StationAttempt[];
  latest?: StationAttempt;
  previous?: StationAttempt;
  first?: StationAttempt;
  best?: StationAttempt;
  /** Positive = faster than previous attempt. */
  changeVsPreviousSec: number;
  improvementPct: number;
}

export function stationSummaries(workouts: Workout[]): StationSummary[] {
  return STATIONS.map((s) => {
    const history = stationHistory(workouts, s.id);
    const latest = history[history.length - 1];
    const previous = history[history.length - 2];
    const first = history[0];
    const best = history.reduce<StationAttempt | undefined>((b, a) => (!b || a.timeSec < b.timeSec ? a : b), undefined);
    return {
      id: s.id,
      name: s.name,
      history,
      latest,
      previous,
      first,
      best,
      changeVsPreviousSec: latest && previous ? previous.timeSec - latest.timeSec : 0,
      improvementPct: latest && first ? ((first.timeSec - latest.timeSec) / first.timeSec) * 100 : 0,
    };
  });
}
