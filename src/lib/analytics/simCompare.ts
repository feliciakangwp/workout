import { STATIONS, simFraction, simLabel } from '../../data/stations';
import type { Race, RaceFormat, SimType, StationId, WeightCategory, Workout } from '../../data/types';
import { fmtShort } from '../dates';
import { fmtTime } from '../format';

/**
 * Full-distance estimate for half and ¾ sims: station times are scaled to the
 * full distance, then slowed a little because a full sim carries more fatigue
 * into every station and run (the runs are always 1 km).
 */
export const SIM_FATIGUE: Record<SimType, { station: number; run: number }> = {
  half: { station: 1.04, run: 1.02 },
  threeQuarter: { station: 1.02, run: 1.01 },
  full: { station: 1, run: 1 },
};

/** Typical Roxzone (transition) time when no race has one recorded. */
const DEFAULT_ROXZONE: Record<'solo' | 'doubles', number> = { solo: 7 * 60, doubles: 7.5 * 60 };
/** Doubles split each station's work between partners; runs are done together. */
const DOUBLES_STATION_SHARE = 0.55;
const DOUBLES_RUN_FACTOR = 0.99;

export interface Performance {
  /** Workout id for sims, race id for races. */
  id: string;
  source: 'sim' | 'race';
  label: string;
  date: string;
  /** Races only; sims are always done alone. */
  format?: RaceFormat;
  category: WeightCategory;
  sim?: SimType;
  /** Full-distance equivalent times per station (runs are the 1 km before each station). */
  splits: Partial<Record<StationId, { runSec?: number; stationSec?: number }>>;
  roxzoneSec?: number;
}

/** Every HYROX sim and completed race with splits, as full-distance equivalents. */
export function hyroxPerformances(workouts: Workout[], races: Race[]): Performance[] {
  const out: Performance[] = [];
  for (const w of workouts) {
    if (!w.hyrox) continue;
    const f = simFraction(w.hyrox.sim);
    const k = SIM_FATIGUE[w.hyrox.sim];
    const splits: Performance['splits'] = {};
    for (const s of w.hyrox.splits)
      if (s.runSec || s.stationSec)
        splits[s.station] = {
          runSec: s.runSec ? Math.round(s.runSec * k.run) : undefined,
          stationSec: s.stationSec ? Math.round((s.stationSec / f) * k.station) : undefined,
        };
    out.push({ id: w.id, source: 'sim', label: `${simLabel(w.hyrox.sim)} · ${fmtShort(w.date)}`, date: w.date, category: w.hyrox.division.category, sim: w.hyrox.sim, splits });
  }
  for (const r of races) {
    if (!r.result?.splits.length) continue;
    const splits: Performance['splits'] = {};
    for (const s of r.result.splits) if (s.runSec || s.stationSec) splits[s.station] = { runSec: s.runSec, stationSec: s.stationSec };
    if (!Object.keys(splits).length) continue;
    out.push({ id: r.id, source: 'race', label: `${r.name} · ${fmtShort(r.date)} ${r.date.slice(0, 4)}`, date: r.date, format: r.format, category: r.format === 'relay' ? 'open' : r.category, splits, roxzoneSec: r.result.roxzoneSec });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Individual efforts: sims, solo races and relay legs (doubles stations are shared, so not comparable). */
const individual = (p: Performance) => p.format !== 'doubles';

export interface Best {
  sec: number;
  from: Performance;
}
const bestOf = (list: Performance[], station: StationId, part: 'runSec' | 'stationSec'): Best | undefined =>
  list.reduce<Best | undefined>((b, p) => {
    const sec = p.splits[station]?.[part];
    return sec && (!b || sec < b.sec) ? { sec, from: p } : b;
  }, undefined);

const sum = (xs: (number | undefined)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

export interface SimStationRow {
  station: StationId;
  name: string;
  /** This sim, full-distance equivalent. */
  runSec?: number;
  stationSec?: number;
  /** Time actually recorded (differs for half / ¾ sims). */
  rawStationSec?: number;
  bestRun?: Best;
  bestStation?: Best;
}

/** One sim compared, station by station, with the best result from any other sim or race. */
export function compareSim(workout: Workout, performances: Performance[]) {
  const me = performances.find((p) => p.id === workout.id);
  const others = performances.filter((p) => p.id !== workout.id && individual(p));
  const rows: SimStationRow[] = STATIONS.map((s) => ({
    station: s.id,
    name: s.name,
    runSec: me?.splits[s.id]?.runSec,
    stationSec: me?.splits[s.id]?.stationSec,
    rawStationSec: workout.hyrox?.splits.find((x) => x.station === s.id)?.stationSec,
    bestRun: bestOf(others, s.id, 'runSec'),
    bestStation: bestOf(others, s.id, 'stationSec'),
  }));
  const complete = rows.every((r) => r.runSec && r.stationSec);
  const estimatedSec = sum(rows.flatMap((r) => [r.runSec, r.stationSec]));
  // Best complete effort to date, runs + stations (Roxzone excluded so sims and races compare).
  const fullEfforts = others
    .filter((p) => STATIONS.every((s) => p.splits[s.id]?.runSec && p.splits[s.id]?.stationSec) && p.format !== 'relay')
    .map((p) => ({ p, sec: sum(STATIONS.flatMap((s) => [p.splits[s.id]!.runSec, p.splits[s.id]!.stationSec])) }))
    .sort((a, b) => a.sec - b.sec);
  const bestFull = fullEfforts[0];
  // Fastest possible: every station and run at its best, including this sim.
  const combinedBest = sum(rows.flatMap((r) => [Math.min(r.runSec ?? Infinity, r.bestRun?.sec ?? Infinity), Math.min(r.stationSec ?? Infinity, r.bestStation?.sec ?? Infinity)].map((x) => (x === Infinity ? undefined : x))));

  const newBests = rows.filter((r) => r.stationSec && (!r.bestStation || r.stationSec < r.bestStation.sec));
  const gaps = rows
    .filter((r) => r.stationSec && r.bestStation && r.stationSec > r.bestStation.sec)
    .sort((a, b) => b.stationSec! - b.bestStation!.sec - (a.stationSec! - a.bestStation!.sec));
  const runRows = rows.filter((r) => r.runSec);
  const runAvg = runRows.length ? sum(runRows.map((r) => r.runSec)) / runRows.length : undefined;
  const bestRunAvg = (() => {
    const b = rows.map((r) => r.bestRun?.sec).filter((x): x is number => !!x);
    return b.length ? sum(b) / b.length : undefined;
  })();

  const insights: string[] = [];
  if (workout.hyrox && workout.hyrox.sim !== 'full')
    insights.push(`${simLabel(workout.hyrox.sim)} scaled to a full sim: ${complete ? '' : 'about '}${fmtTime(estimatedSec)} of runs + stations${complete ? '' : ' for the parts logged'}.`);
  if (bestFull && complete) {
    const d = estimatedSec - bestFull.sec;
    insights.push(d < 0 ? `${fmtTime(-d)} faster than your best full effort (${bestFull.p.label}).` : `${fmtTime(d)} slower than your best full effort (${bestFull.p.label}).`);
  }
  if (newBests.length) insights.push(`New best on ${newBests.map((r) => r.name).join(', ')}.`);
  if (gaps.length) insights.push(`Most time lost vs your best: ${gaps.slice(0, 2).map((r) => `${r.name} (+${fmtTime(r.stationSec! - r.bestStation!.sec)})`).join(', ')}.`);
  if (runAvg && bestRunAvg) {
    const d = Math.round(runAvg - bestRunAvg);
    insights.push(d <= 0 ? `Runs averaged ${fmtTime(runAvg)}/km, on par with your best runs.` : `Runs averaged ${fmtTime(runAvg)}/km, ${d}s/km slower than your best runs.`);
  }
  return { rows, complete, estimatedSec, bestFull, combinedBest, insights, hasHistory: others.length > 0 };
}

export interface EstimateRow {
  station: StationId;
  name: string;
  run: { best: number; avg: number; n: number };
  station_: { best: number; avg: number; n: number };
  /** No result for this station yet: the example target time is used. */
  assumed: boolean;
}

/**
 * Finish-time range for an upcoming solo or doubles race: the fast end uses the
 * best time for every run and station, the slow end the average.
 */
export function raceEstimate(race: Race, performances: Performance[]) {
  const format = race.format === 'doubles' ? 'doubles' : 'solo';
  // Prefer efforts at the race's weights when there are any.
  const sameWeights = performances.filter((p) => p.category === race.category);
  const pool = sameWeights.length ? sameWeights : performances;
  const solo = pool.filter(individual);
  const doubles = pool.filter((p) => p.format === 'doubles');
  const stats = (xs: number[]) => (xs.length ? { best: Math.min(...xs), avg: Math.round(sum(xs) / xs.length), n: xs.length } : undefined);
  const times = (list: Performance[], s: StationId, part: 'runSec' | 'stationSec') => list.map((p) => p.splits[s]?.[part]).filter((x): x is number => !!x);

  const allRuns = pool.flatMap((p) => STATIONS.map((s) => p.splits[s.id]?.runSec)).filter((x): x is number => !!x);
  const anyRun = stats(allRuns);
  const notes: string[] = [];
  let scaled = false;
  const rows: EstimateRow[] = STATIONS.map((s) => {
    let station = stats(times(solo, s.id, 'stationSec'));
    let run = stats(times(pool, s.id, 'runSec')) ?? anyRun;
    if (format === 'doubles') {
      const d = stats(times(doubles, s.id, 'stationSec'));
      if (d) station = d;
      else if (station) {
        scaled = true;
        station = { best: Math.round(station.best * DOUBLES_STATION_SHARE), avg: Math.round(station.avg * DOUBLES_STATION_SHARE), n: station.n };
      }
      if (run && !times(doubles, s.id, 'runSec').length) run = { ...run, best: Math.round(run.best * DOUBLES_RUN_FACTOR), avg: Math.round(run.avg * DOUBLES_RUN_FACTOR) };
    }
    const assumed = !station;
    const target = s.targetSec * (format === 'doubles' ? DOUBLES_STATION_SHARE : 1);
    return {
      station: s.id,
      name: s.name,
      run: run ?? { best: 330, avg: 360, n: 0 },
      station_: station ?? { best: Math.round(target), avg: Math.round(target * 1.1), n: 0 },
      assumed,
    };
  });

  const roxOf = (list: Performance[]) => list.filter((p) => p.roxzoneSec).map((p) => p.roxzoneSec!);
  const roxSame = roxOf(performances.filter((p) => (format === 'doubles' ? p.format === 'doubles' : p.format === 'solo')));
  const rox = roxSame.length ? roxSame : roxOf(performances);
  const roxzone = stats(rox) ?? { best: DEFAULT_ROXZONE[format], avg: DEFAULT_ROXZONE[format], n: 0 };
  if (!rox.length) notes.push(`Roxzone not recorded in a race yet: ${fmtTime(DEFAULT_ROXZONE[format])} assumed.`);
  else if (!roxSame.length) notes.push(`Roxzone taken from your other races (none recorded in a ${format} race yet).`);
  if (scaled) notes.push(`No doubles splits yet: station times are your solo times × ${DOUBLES_STATION_SHARE} (work shared with your partner).`);
  const assumed = rows.filter((r) => r.assumed);
  if (assumed.length) notes.push(`No results yet for ${assumed.map((r) => r.name).join(', ')}: example target time used.`);
  if (!sameWeights.length && performances.length) notes.push(`No results at ${race.category === 'pro' ? 'Pro' : 'Open'} weights yet: based on your other results.`);
  if (!allRuns.length) notes.push('No run splits yet: 5:30–6:00 /km assumed.');

  const fastSec = sum(rows.flatMap((r) => [r.run.best, r.station_.best])) + roxzone.best;
  const typicalSec = sum(rows.flatMap((r) => [r.run.avg, r.station_.avg])) + roxzone.avg;
  return { format, rows, roxzone, fastSec, typicalSec, notes, basis: { sims: pool.filter((p) => p.source === 'sim').length, races: pool.filter((p) => p.source === 'race').length } };
}

export type RaceEstimate = ReturnType<typeof raceEstimate>;

/**
 * Doubles team estimate: the average of each partner's estimate, so the fast end
 * is the average of both best times and the slow end the average of both averages.
 */
export function combineEstimates(list: RaceEstimate[]): RaceEstimate {
  const avg = (xs: number[]) => Math.round(xs.reduce((a, x) => a + x, 0) / xs.length);
  const [first] = list;
  return {
    ...first,
    rows: first.rows.map((r, i) => ({
      ...r,
      run: { best: avg(list.map((e) => e.rows[i].run.best)), avg: avg(list.map((e) => e.rows[i].run.avg)), n: list.reduce((a, e) => a + e.rows[i].run.n, 0) },
      station_: { best: avg(list.map((e) => e.rows[i].station_.best)), avg: avg(list.map((e) => e.rows[i].station_.avg)), n: list.reduce((a, e) => a + e.rows[i].station_.n, 0) },
      assumed: list.every((e) => e.rows[i].assumed),
    })),
    roxzone: { best: avg(list.map((e) => e.roxzone.best)), avg: avg(list.map((e) => e.roxzone.avg)), n: list.reduce((a, e) => a + e.roxzone.n, 0) },
    fastSec: avg(list.map((e) => e.fastSec)),
    typicalSec: avg(list.map((e) => e.typicalSec)),
    notes: [...new Set(list.flatMap((e) => e.notes))],
    basis: { sims: list.reduce((a, e) => a + e.basis.sims, 0), races: list.reduce((a, e) => a + e.basis.races, 0) },
  };
}
