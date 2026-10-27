import { STATIONS, STATION_BY_ID, stationWeight } from '../../data/stations';
import type { Division, StationId, Workout } from '../../data/types';
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
  /** A HYROX sim or station practice, or station work inside a HYROX Engine session. */
  source: 'sim' | 'engine';
  /** Engine work: the distance (m) or reps done. */
  amount?: number;
}

/** Library exercises that are a station's work in a HYROX Engine session. */
const STATION_EXERCISES: Record<StationId, string[]> = Object.fromEntries(STATIONS.map((s) => [s.id, s.id === 'farmersCarry' ? [s.exercise, "Farmer's Carry"] : [s.exercise]])) as Record<StationId, string[]>;
/** Engine work shorter than this share of the station isn't scaled up: a short burst says little about the full station. */
const MIN_FRACTION = 0.25;

/** Station score: 100 = example target time. Capped at 120. */
export const stationScore = (id: StationId, timeSec: number) =>
  Math.min(120, Math.round((STATION_BY_ID[id].targetSec / timeSec) * 100));

/**
 * Every timed attempt at a station, as a full-station time. Sims count as logged. HYROX
 * Engine station work counts when complete: the distance (or wall ball reps) and its time,
 * and for weighted stations at least the race weight of `division`; its time is scaled to
 * the full station like a part sim.
 */
export function stationHistory(workouts: Workout[], id: StationId, division: Division): StationAttempt[] {
  const st = STATION_BY_ID[id];
  const raceKg = stationWeight(id, division);
  const out: StationAttempt[] = [];
  for (const w of workouts) {
    for (const s of w.stations ?? [])
      if (s.station === id) {
        const fraction = s.fraction ?? 1;
        const timeSec = Math.round(s.timeSec / fraction);
        out.push({ date: w.date, workoutId: w.id, timeSec, rawSec: s.timeSec, fraction, score: stationScore(id, timeSec), source: 'sim' });
      }
    if (w.type !== 'HYROX Engine' || w.hyrox || w.fromPlan) continue;
    for (const e of w.exercises) {
      if (!STATION_EXERCISES[id].includes(e.name) || !e.durationSec) continue;
      const amount = st.unit === 'm' ? e.distanceM : e.reps;
      if (!amount || (raceKg && !((e.weightKg ?? 0) >= raceKg))) continue;
      const fraction = amount / st.amount;
      if (fraction < MIN_FRACTION) continue;
      const timeSec = Math.round(e.durationSec / fraction);
      out.push({ date: w.date, workoutId: w.id, timeSec, rawSec: e.durationSec, fraction, score: stationScore(id, timeSec), source: 'engine', amount });
    }
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

export function stationSummaries(workouts: Workout[], division: Division): StationSummary[] {
  return STATIONS.map((s) => {
    const history = stationHistory(workouts, s.id, division);
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
