import { EXERCISE_BY_NAME } from '../../data/exercises';
import { MUSCLES } from '../../data/muscles';
import { STATIONS, stationSpec, stationWeight } from '../../data/stations';
import type { Division, Goals, MuscleGroup, Race, Sex, StationId } from '../../data/types';

/** Relays always race at the athlete's open weights. */
export const raceDivision = (race: Race, sex: Sex): Division => ({ sex, category: race.format === 'relay' ? 'open' : race.category });

export function raceTypeLabel(race: Race, sex: Sex) {
  const who = sex === 'female' ? "Women's" : "Men's";
  if (race.format === 'relay') return `Relay · ${sex === 'female' ? "women's" : "men's"} open weights`;
  const cat = race.category === 'pro' ? 'Pro' : 'Open';
  return race.format === 'doubles' ? `${who} Doubles ${cat}` : `${who} ${cat} (Solo)`;
}

export const upcomingRaces = (goals: Goals, today: string) =>
  [...goals.races].filter((r) => r.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));

export interface RaceSegment {
  station: StationId;
  name: string;
  order: number;
  included: boolean;
  /** Kilometres this athlete runs before the station. */
  runKm: number;
  /** Share of the station work this athlete does (0.5 when split with a doubles partner). */
  share: number;
  spec: string;
  weightKg?: number;
}

export function raceSegments(race: Race, sex: Sex): RaceSegment[] {
  const division = raceDivision(race, sex);
  return STATIONS.map((s) => {
    const included = race.format !== 'relay' || race.relayStations.includes(s.id);
    return {
      station: s.id,
      name: s.name,
      order: s.order,
      included,
      runKm: included ? 1 : 0,
      share: included ? (race.format === 'doubles' ? 0.5 : 1) : 0,
      spec: stationSpec(s.id, division),
      weightKg: stationWeight(s.id, division),
    };
  });
}

export function raceSummary(race: Race, sex: Sex) {
  const segs = raceSegments(race, sex).filter((s) => s.included);
  return {
    runKm: segs.reduce((a, s) => a + s.runKm, 0),
    stations: segs.length,
    note:
      race.format === 'doubles'
        ? 'You run every 1 km yourself; station work is shared with your partner.'
        : race.format === 'relay'
          ? 'You run 1 km before each of your chosen stations.'
          : 'You complete every run and every station on your own.',
  };
}

export type FocusLevel = 'primary' | 'secondary' | 'low';
export interface MuscleFocus {
  id: MuscleGroup;
  label: string;
  score: number;
  level: FocusLevel;
  sources: string[];
}

const RUN_MUSCLES: { primary: MuscleGroup[]; secondary: MuscleGroup[] } = {
  primary: ['quadriceps', 'calves', 'hamstrings'],
  secondary: ['glutes', 'core'],
};

/**
 * Relative demand each muscle group faces in this race, from the athlete's
 * runs and station share. Pro weights add extra emphasis to loaded stations.
 */
export function raceMuscleFocus(race: Race, sex: Sex): MuscleFocus[] {
  const load = Object.fromEntries(MUSCLES.map((m) => [m.id, 0])) as Record<MuscleGroup, number>;
  const sources = Object.fromEntries(MUSCLES.map((m) => [m.id, [] as string[]])) as Record<MuscleGroup, string[]>;
  const division = raceDivision(race, sex);
  for (const seg of raceSegments(race, sex).filter((s) => s.included)) {
    const info = EXERCISE_BY_NAME[STATIONS.find((s) => s.id === seg.station)!.exercise];
    const heavy = division.category === 'pro' && seg.weightKg ? 1.3 : 1;
    info.primary.forEach((m) => {
      load[m] += seg.share * heavy;
      sources[m].push(seg.name);
    });
    info.secondary.forEach((m) => (load[m] += seg.share * heavy * 0.5));
    RUN_MUSCLES.primary.forEach((m) => (load[m] += seg.runKm * 0.35));
    RUN_MUSCLES.secondary.forEach((m) => (load[m] += seg.runKm * 0.15));
  }
  const runKm = raceSummary(race, sex).runKm;
  if (runKm) RUN_MUSCLES.primary.forEach((m) => sources[m].unshift(`Running (${runKm} km)`));
  const max = Math.max(...Object.values(load), 1e-9);
  return MUSCLES.map((m) => {
    const score = Math.round((load[m.id] / max) * 100);
    const level: FocusLevel = score >= 65 ? 'primary' : score >= 30 ? 'secondary' : 'low';
    return { id: m.id, label: m.label, score, level, sources: sources[m.id] };
  }).sort((a, b) => b.score - a.score);
}
