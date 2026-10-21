import { EXERCISE_BY_NAME } from '../../data/exercises';
import { MUSCLES } from '../../data/muscles';
import { STATIONS, stationSpec, stationWeight } from '../../data/stations';
import { REDLINE_STATIONS, redlineConfig } from '../../data/redline';
import type { Division, Goals, MuscleGroup, Profile, Race, RaceKind, Sex, StationId, Workout } from '../../data/types';
import { avgPace, predictTime, runs } from './running';

/** Relays always race at the athlete's open weights. */
export const raceDivision = (race: Race, sex: Sex): Division => ({ sex, category: race.format === 'relay' ? 'open' : race.category });

/** Races saved before race kinds existed are HYROX races. */
export const raceKind = (race: Pick<Race, 'kind'>): RaceKind => race.kind ?? 'hyrox';
export const isHyrox = (race: Pick<Race, 'kind'>) => raceKind(race) === 'hyrox';

export const RACE_KIND_LABEL: Record<RaceKind, string> = { hyrox: 'HYROX', redline: 'Redline', marathon: 'Marathon', other: 'Other race' };

/** Running race distances to pick from; anything else is entered in km. */
export const RUN_DISTANCES = [
  { km: 5, label: '5K' },
  { km: 10, label: '10K' },
  { km: 21.0975, label: 'Half marathon' },
  { km: 42.195, label: 'Marathon' },
];

export const distanceLabel = (km?: number) => {
  if (!km) return 'distance not set';
  const named = RUN_DISTANCES.find((d) => Math.abs(d.km - km) < 0.01);
  return named ? `${named.label} · ${Math.round(km * 10) / 10} km` : `${Math.round(km * 100) / 100} km`;
};

/** Redline category for a race, with the athlete's sex as the default division. */
export const redlineFor = (race: Race, sex: Sex) => {
  const division = race.redline?.division ?? (sex === 'female' ? 'women' : 'men');
  const level = race.redline?.level ?? 1;
  return { division, level, config: redlineConfig(race.format, division, level) };
};

export function raceTypeLabel(race: Race, sex: Sex) {
  const kind = raceKind(race);
  if (kind === 'marathon') {
    const named = RUN_DISTANCES.some((d) => race.distanceKm && Math.abs(d.km - race.distanceKm) < 0.01);
    return named ? distanceLabel(race.distanceKm) : `Running race · ${distanceLabel(race.distanceKm)}`;
  }
  if (kind === 'other') return 'Other race';
  if (kind === 'redline') return `Redline · ${redlineFor(race, sex).config.label}`;
  const who = sex === 'female' ? "Women's" : "Men's";
  if (race.format === 'relay') return `Relay · ${sex === 'female' ? "women's" : "men's"} open weights`;
  const cat = race.category === 'pro' ? 'Pro' : 'Open';
  return race.format === 'doubles' ? `${who} Doubles ${cat}` : `${who} ${cat} (Solo)`;
}

/** "with Fiona" / "with Fiona, Jordan" for races with tagged teammates. */
export const teamLabel = (race: Race) => (race.teammates?.length ? `with ${race.teammates.map((t) => t.displayName).join(', ')}` : '');

export const upcomingRaces = (goals: Goals, today: string) =>
  [...goals.races].filter((r) => r.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));

/** Races whose date has passed, most recent first. */
export const completedRaces = (goals: Goals, today: string) =>
  [...goals.races].filter((r) => r.date < today).sort((a, b) => (a.date < b.date ? 1 : -1));

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
  const kind = raceKind(race);
  if (kind === 'marathon') return { runKm: Math.round((race.distanceKm ?? 0) * 10) / 10, stations: 0, note: 'One continuous run.' };
  if (kind === 'other') return { runKm: 0, stations: 0, note: '' };
  if (kind === 'redline')
    return {
      runKm: 0,
      stations: REDLINE_STATIONS.length,
      note: race.format === 'doubles' ? 'Station work is shared with your partner.' : race.format === 'relay' ? 'Stations are split across the team.' : 'You complete all 12 stations on your own.',
    };
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
 * Solo and doubles races cover every station, so every muscle group is a focus.
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
    const level: FocusLevel = race.format !== 'relay' ? 'primary' : score >= 65 ? 'primary' : score >= 30 ? 'secondary' : 'low';
    return { id: m.id, label: m.label, score, level, sources: sources[m.id] };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Primary muscle groups to emphasise (bold) on Muscle Analysis: only while
 * every upcoming race is a relay, since full races already demand every group.
 */
export function relayFocusMuscles(goals: Goals, today: string): Set<MuscleGroup> {
  const races = upcomingRaces(goals, today).filter(isHyrox);
  if (!races.length || races.some((r) => r.format !== 'relay')) return new Set();
  return new Set(races.flatMap((r) => raceMuscleFocus(r, goals.athleteSex).filter((f) => f.level === 'primary').map((f) => f.id)));
}

// ---------------------------------------------------------------------------
// Completed race results
// ---------------------------------------------------------------------------

/** Stations whose splits apply to this race (a relay athlete's own legs only). */
export const raceStations = (race: Race) => STATIONS.filter((s) => race.format !== 'relay' || race.relayStations.includes(s.id));

/**
 * Stations with result splits: all eight for every format. A relay result is the
 * team's, so every leg is entered, not only the athlete's own.
 */
export const resultStations = () => STATIONS;

/** Who does a relay leg, for labels: "You", a teammate's name, or "Other teammate". */
export function legName(race: Race, station: StationId, me: Profile): string {
  const who = race.legs?.[station] ?? (race.relayStations.includes(station) ? me.id : undefined);
  if (!who) return 'Not set';
  if (who === me.id) return 'You';
  return race.teammates?.find((t) => t.id === who)?.displayName ?? 'Other teammate';
}

export function resultTotals(race: Race) {
  const r = race.result;
  const stations = resultStations();
  const splits = stations.map((st) => r?.splits.find((x) => x.station === st.id));
  const filled = splits.filter((x) => x?.runSec && x?.stationSec).length;
  const runSec = splits.reduce((a, x) => a + (x?.runSec ?? 0), 0);
  const stationSec = splits.reduce((a, x) => a + (x?.stationSec ?? 0), 0);
  const complete = filled === stations.length;
  const auto = complete && !!r?.roxzoneSec;
  return {
    runSec,
    stationSec,
    roxzoneSec: r?.roxzoneSec,
    missing: stations.length - filled,
    hasSplits: filled > 0,
    auto,
    totalSec: auto ? runSec + stationSec + r!.roxzoneSec! : r?.totalSec,
  };
}

export interface SegmentDelta {
  key: string;
  label: string;
  currentSec: number;
  previousSec: number;
  /** Positive = slower than the previous race. */
  deltaSec: number;
}

/** Most recent earlier completed race with a time, preferring the same format. */
export function previousRace(race: Race, completed: Race[]) {
  const sameKind = (r: Race) => raceKind(r) === raceKind(race) && (raceKind(race) !== 'marathon' || Math.abs((r.distanceKm ?? 0) - (race.distanceKm ?? 0)) < 0.01);
  const earlier = completed.filter((r) => r.date < race.date && resultTotals(r).totalSec && sameKind(r));
  return earlier.find((r) => r.format === race.format) ?? earlier[0];
}

export function compareRaces(current: Race, previous: Race): { segments: SegmentDelta[]; totals: SegmentDelta[] } {
  const a = resultTotals(current);
  const b = resultTotals(previous);
  const segments: SegmentDelta[] = [];
  for (const st of resultStations()) {
    const x = current.result?.splits.find((s) => s.station === st.id);
    const y = previous.result?.splits.find((s) => s.station === st.id);
    if (x?.runSec && y?.runSec) segments.push({ key: `run-${st.id}`, label: `Run ${st.order}`, currentSec: x.runSec, previousSec: y.runSec, deltaSec: x.runSec - y.runSec });
    if (x?.stationSec && y?.stationSec) segments.push({ key: st.id, label: st.name, currentSec: x.stationSec, previousSec: y.stationSec, deltaSec: x.stationSec - y.stationSec });
  }
  const totals: SegmentDelta[] = [];
  const add = (key: string, label: string, c?: number, p?: number) => c && p && totals.push({ key, label, currentSec: c, previousSec: p, deltaSec: c - p });
  add('total', 'Finish time', a.totalSec, b.totalSec);
  if (a.hasSplits && b.hasSplits) {
    add('runs', 'All runs', a.runSec, b.runSec);
    add('stations', 'All stations', a.stationSec, b.stationSec);
  }
  add('roxzone', 'Roxzone', a.roxzoneSec, b.roxzoneSec);
  return { segments, totals };
}

// ---------------------------------------------------------------------------
// Running race estimate
// ---------------------------------------------------------------------------

export interface RunRaceEstimate {
  fastSec: number;
  typicalSec: number;
  /** Runs used for the estimate. */
  n: number;
  basis: string;
}

/**
 * Finish time for a running race from the athlete's runs (Riegel): the fast end
 * from the best run of 3 km or more, the typical end from the average pace of
 * the last 8 weeks of runs.
 */
export function runRaceEstimate(workouts: Workout[], distanceKm: number, today: string): RunRaceEstimate | null {
  if (!distanceKm) return null;
  const all = runs(workouts).filter((r) => r.date <= today && r.paceSecPerKm > 0);
  const long = all.filter((r) => r.distanceKm >= 3);
  if (!long.length) return null;
  const fastSec = Math.min(...long.map((r) => predictTime(r.durationSec, r.distanceKm, distanceKm)));
  const cutoff = new Date(Date.parse(today) - 56 * 86400000).toISOString().slice(0, 10);
  const recent = long.filter((r) => r.date >= cutoff);
  const pool = recent.length ? recent : long;
  const km = pool.reduce((a, r) => a + r.distanceKm, 0) / pool.length;
  const typicalSec = Math.max(fastSec, predictTime(avgPace(pool) * km, km, distanceKm));
  return { fastSec, typicalSec, n: pool.length, basis: `${long.length} run${long.length === 1 ? '' : 's'} of 3 km or more` };
}
