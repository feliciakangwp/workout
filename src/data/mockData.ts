/**
 * DEMONSTRATION DATA
 * -------------------------------------------------------------
 * Every number shown in the dashboard is derived from the records
 * generated in this file (plus any workouts added during the session).
 * The data is synthetic but follows a realistic 13-week HYROX training
 * block for a female athlete: steady strength progression, improving
 * running economy, a mid-block illness week and normal day-to-day noise.
 * It is generated with a seeded RNG so it is identical on every load.
 */
import { dateRange, diffDays, weekdayIndex } from '../lib/dates';
import { round } from '../lib/format';
import { STATIONS } from './stations';
import type { ExerciseEntry, Goals, RaceResult, RunData, RunKind, StationResult, Workout } from './types';

/** The prototype's fixed "today" so the demo data always lines up with the calendar. */
export const DEMO_TODAY = '2026-10-17';
/** First day of the 13-week demonstration block (a Monday). */
export const DATA_START = '2026-07-20';

function raceResult(runs: number[], stations: number[], roxzoneSec: number): RaceResult {
  const splits = STATIONS.map((st, i) => ({ station: st.id, runSec: runs[i], stationSec: stations[i] }));
  return { roxzoneSec, totalSec: runs.reduce((a, b) => a + b, 0) + stations.reduce((a, b) => a + b, 0) + roxzoneSec, splits };
}

export const DEFAULT_GOALS: Goals = {
  currentWeightKg: 64,
  targetWeightKg: 60,
  runGoalDistanceKm: 10,
  runGoalPaceSecPerKm: 300,
  weeklySessionsTarget: 6,
  weeklyRunKmTarget: 18,
  athleteSex: 'female',
  races: [
    { id: 'race-1', name: 'HYROX Singapore', date: '2026-11-28', format: 'doubles', category: 'open', relayStations: [] },
    { id: 'race-2', name: 'HYROX Mixed Relay', date: '2027-01-23', format: 'relay', category: 'open', relayStations: ['skierg', 'wallBalls'] },
    // Completed races (dates before DEMO_TODAY) with sample results.
    { id: 'race-p1', name: 'HYROX Melbourne', date: '2026-03-14', format: 'solo', category: 'open', relayStations: [], result: raceResult([345, 362, 371, 378, 380, 385, 392, 401], [290, 220, 310, 330, 300, 130, 320, 400], 450) },
    { id: 'race-p2', name: 'HYROX Sydney Relay', date: '2026-05-16', format: 'relay', category: 'open', relayStations: ['skierg', 'wallBalls'], result: { totalSec: 1478, splits: [] } },
    { id: 'race-p3', name: 'HYROX Bangkok', date: '2026-07-11', format: 'solo', category: 'open', relayStations: [], result: raceResult([330, 349, 355, 362, 371, 376, 398, 410], [278, 195, 292, 338, 288, 124, 304, 412], 405) },
  ],
};

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Generator state; reset for each athlete by generateSample(). */
let rand = mulberry32(20261017);
let liftScale = 1;
let paceShiftSec = 0;
/** Uniform noise in [-amp, amp]. */
const noise = (amp: number) => (rand() * 2 - 1) * amp;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const TOTAL_WEEKS = 13;
/** Week 7 (31 Aug – 6 Sep) has a head cold: sessions missed, lifts dip. */
const ILLNESS_WEEK = 6;
/** Missed sessions as `${week}-${weekday}` (weekday 0 = Monday). */
const SKIPPED = new Set(['2-5', '4-4', `${ILLNESS_WEEK}-0`, `${ILLNESS_WEEK}-2`, `${ILLNESS_WEEK}-3`, '9-1', '10-5']);

// ---------------------------------------------------------------------------
// Session builders
// ---------------------------------------------------------------------------
const F45_TEMPLATES: { title: string; build: (p: number) => ExerciseEntry[] }[] = [
  {
    title: 'F45 — Lower Body Hybrid',
    build: (p) => [
      { name: 'Goblet Squat', sets: 3, reps: 12, weightKg: round(lerp(14, 18, p), 2) },
      { name: 'Walking Lunges', sets: 3, reps: 12, weightKg: round(lerp(6, 9, p), 1) },
      { name: 'Kettlebell Swing', sets: 3, reps: 15, weightKg: 16 },
      { name: 'Box Jump', sets: 3, reps: 10 },
      { name: 'Russian Twist', sets: 3, reps: 20, weightKg: 5 },
    ],
  },
  {
    title: 'F45 — Upper Body Strength',
    build: (p) => [
      { name: 'Push-up', sets: 3, reps: Math.round(lerp(10, 14, p)) },
      { name: 'Renegade Row', sets: 3, reps: 10, weightKg: round(lerp(7, 9, p), 1) },
      { name: 'Thruster', sets: 3, reps: 12, weightKg: round(lerp(7, 9, p), 1) },
      { name: 'Tricep Dip', sets: 2, reps: 12 },
      { name: 'Plank', sets: 3, durationSec: 45 },
    ],
  },
  {
    title: 'F45 — Total Body Conditioning',
    build: (p) => [
      { name: 'Thruster', sets: 3, reps: 10, weightKg: round(lerp(8, 10, p), 1) },
      { name: 'Burpee', sets: 3, reps: 10 },
      { name: 'Kettlebell Swing', sets: 3, reps: 15, weightKg: 16 },
      { name: 'Bent-over Row', sets: 3, reps: 12, weightKg: round(lerp(8, 10, p), 1) },
      { name: 'Box Jump', sets: 2, reps: 10 },
      { name: 'Russian Twist', sets: 2, reps: 20, weightKg: 5 },
    ],
  },
];

interface LiftPlan {
  name: string;
  sets: number;
  reps: number;
  start: number;
  end: number;
  step: number;
}
const LIFTS: LiftPlan[] = [
  { name: 'Squat', sets: 4, reps: 6, start: 45, end: 57.5, step: 2.5 },
  { name: 'Romanian Deadlift', sets: 4, reps: 8, start: 50, end: 65, step: 2.5 },
  { name: 'Bulgarian Split Squat', sets: 3, reps: 8, start: 10, end: 14, step: 1 },
  { name: 'Lat Pulldown', sets: 3, reps: 10, start: 35, end: 43, step: 1 },
  { name: 'Chest Press', sets: 3, reps: 10, start: 25, end: 32.5, step: 2.5 },
  { name: 'Shoulder Press', sets: 3, reps: 10, start: 9, end: 12, step: 1 },
  { name: "Farmer's Carry", sets: 4, reps: 40, start: 20, end: 26, step: 2 },
];

function strengthSession(week: number): ExerciseEntry[] {
  const p = week / (TOTAL_WEEKS - 1);
  const dip = week === ILLNESS_WEEK + 1 ? 0.92 : 1; // first session back after illness
  const entries: ExerciseEntry[] = LIFTS.map((l) => {
    const start = l.start * liftScale;
    const target = lerp(start, l.end * liftScale, Math.pow(p, 0.85)) * dip + noise(l.step * 0.4);
    const weightKg = Math.max(round(start, l.step), round(target, l.step));
    // Occasional rep PR when the athlete repeats a load.
    const reps = l.reps + (rand() < 0.2 ? 1 : 0);
    return { name: l.name, sets: l.sets, reps, weightKg };
  });
  entries.push({ name: 'Hip Thrust', sets: 3, reps: 10, weightKg: round(lerp(50, 70, p), 5) });
  if (week % 2 === 0) entries.push({ name: 'Seated Cable Row', sets: 3, reps: 12, weightKg: round(lerp(30, 36, p), 2) });
  else entries.push({ name: 'Bicep Curl', sets: 2, reps: 12, weightKg: round(lerp(6, 8, p), 1) });
  return entries;
}

function engineSession(week: number): ExerciseEntry[] {
  return [
    { name: 'SkiErg', sets: 5, distanceM: 250, durationSec: Math.round(lerp(64, 57, week / (TOTAL_WEEKS - 1)) + noise(2)) },
    { name: 'Row Erg', sets: 5, distanceM: 250, durationSec: Math.round(lerp(60, 54, week / (TOTAL_WEEKS - 1)) + noise(2)) },
    { name: 'Sled Push', sets: 4, reps: 25 },
    { name: 'Wall Balls', sets: 4, reps: week > 6 ? 25 : 20, weightKg: 4 },
    { name: 'Burpee Broad Jump', sets: 3, reps: 20 },
  ];
}

const STATION_EXERCISE: Record<string, ExerciseEntry> = {
  skierg: { name: 'SkiErg', sets: 2, distanceM: 500 },
  sledPush: { name: 'Sled Push', sets: 2, reps: 25 },
  sledPull: { name: 'Sled Pull', sets: 2, reps: 25 },
  burpeeBroadJump: { name: 'Burpee Broad Jump', sets: 2, reps: 40 },
  rowing: { name: 'Row Erg', sets: 2, distanceM: 500 },
  farmersCarry: { name: "Farmer's Carry (HYROX)", sets: 2, reps: 100, weightKg: 16 },
  sandbagLunges: { name: 'Sandbag Lunges', sets: 2, reps: 50, weightKg: 10 },
  wallBalls: { name: 'Wall Balls', sets: 2, reps: 50, weightKg: 4 },
};

/** Starting performance as a multiple of the target time, per station. */
const STATION_BASELINE: Record<string, number> = {
  skierg: 1.14,
  sledPush: 1.42,
  sledPull: 1.33,
  burpeeBroadJump: 1.22,
  rowing: 1.1,
  farmersCarry: 1.12,
  sandbagLunges: 1.25,
  wallBalls: 1.3,
};
/** How much of the gap to target each station closes over the block. */
const STATION_GAIN: Record<string, number> = {
  skierg: 0.55,
  sledPush: 0.7,
  sledPull: 0.45,
  burpeeBroadJump: 0.5,
  rowing: 0.6,
  farmersCarry: 0.75,
  sandbagLunges: 0.55,
  wallBalls: 0.35,
};

function stationResults(week: number, ids: string[]): StationResult[] {
  const p = week / (TOTAL_WEEKS - 1);
  return STATIONS.filter((s) => ids.includes(s.id)).map((s) => {
    const base = STATION_BASELINE[s.id];
    const factor = base - (base - 1) * STATION_GAIN[s.id] * p + noise(0.025);
    return { station: s.id, timeSec: Math.round(s.targetSec * factor) };
  });
}

function makeRun(kind: RunKind, week: number): RunData {
  const p = week / (TOTAL_WEEKS - 1);
  const sick = week === ILLNESS_WEEK || week === ILLNESS_WEEK + 1 ? 1 : 0;
  const profile: Record<RunKind, { km: [number, number]; pace: [number, number]; hr: [number, number] }> = {
    Easy: { km: [6.5, 8.5], pace: [382, 352], hr: [151, 146] },
    Long: { km: [9, 11], pace: [375, 350], hr: [153, 149] },
    Tempo: { km: [5.5, 6.5], pace: [336, 314], hr: [167, 164] },
    Intervals: { km: [6, 7], pace: [326, 305], hr: [170, 168] },
    '5K Time Trial': { km: [5, 5], pace: [331, 309], hr: [176, 175] },
    Compromised: { km: [4, 4], pace: [352, 326], hr: [171, 169] },
  };
  const pr = profile[kind];
  return {
    kind,
    distanceKm: Math.round((lerp(pr.km[0], pr.km[1], p) + (kind === '5K Time Trial' || kind === 'Compromised' ? 0 : noise(0.5))) * 10) / 10,
    paceSecPerKm: Math.round(lerp(pr.pace[0], pr.pace[1], p) + noise(6) + sick * 9 + paceShiftSec),
    avgHr: Math.round(lerp(pr.hr[0], pr.hr[1], p) + noise(2) + sick * 3),
  };
}

const runMinutes = (r: RunData) => Math.round((r.distanceKm * r.paceSecPerKm) / 60);

/** Friday run per week of the block (weeks 5 and 9 are partner HYROX practice instead). */
const FRIDAY_RUNS: RunKind[] = ['Easy', 'Tempo', 'Long', '5K Time Trial', 'Easy', 'Tempo', 'Easy', '5K Time Trial', 'Long', 'Intervals', 'Intervals', '5K Time Trial', 'Easy'];
const NOTES: Record<string, string> = {
  '2026-07-24': 'Felt sluggish in the heat — kept it conversational.',
  '2026-08-14': 'First 5K test of the block. Went out too fast.',
  '2026-08-30': 'Partner session. Sled push still the weakest station.',
  '2026-09-07': 'First session back after a cold — reduced loads.',
  '2026-09-11': 'Negative split on the 5K — big confidence boost.',
  '2026-09-25': 'Doubles partner practice: worked on transitions and splits.',
  '2026-10-09': '5K PB! Held 5:10/km pace the whole way.',
  '2026-10-11': 'Full simulation, all 8 stations. Wall balls broke into sets of 10.',
  '2026-10-14': 'RDL felt strong; grip held on carries.',
};

function buildWorkouts(): Workout[] {
  const workouts: Workout[] = [];
  for (const date of dateRange(DATA_START, DEMO_TODAY)) {
    const week = Math.floor(diffDays(date, DATA_START) / 7);
    const dow = weekdayIndex(date);
    if (SKIPPED.has(`${week}-${dow}`)) continue;
    const p = week / (TOTAL_WEEKS - 1);
    const base = { id: `s-${date}`, date, isSample: true, notes: NOTES[date] };

    switch (dow) {
      case 0:
      case 5: {
        const tpl = F45_TEMPLATES[(week + (dow === 5 ? 1 : 0)) % F45_TEMPLATES.length];
        workouts.push({ ...base, type: 'F45', title: tpl.title, durationMin: 50 + Math.round(rand() * 5), intensity: 7 + Math.round(rand()), exercises: tpl.build(p) });
        break;
      }
      case 1:
        workouts.push({
          ...base,
          type: 'Recovery',
          title: week % 2 === 0 ? 'Tuina massage + mobility' : 'Mobility & stretching flow',
          durationMin: week % 2 === 0 ? 60 : 40,
          intensity: 2,
          exercises: [],
        });
        break;
      case 2:
        workouts.push({ ...base, type: 'Strength', title: 'Strength — Full Body', durationMin: 65 + Math.round(rand() * 10), intensity: week === ILLNESS_WEEK + 1 ? 6 : 8, exercises: strengthSession(week) });
        break;
      case 3: {
        const base3 = makeRun('Compromised', week);
        const segments = [0, 1, 2].map((i) => ({ distanceKm: 1, timeSec: Math.round(base3.paceSecPerKm + (i - 1) * 4 + noise(5)) }));
        const run: RunData = { ...base3, kind: 'Intervals', distanceKm: 3, segments, paceSecPerKm: Math.round(segments.reduce((a, x) => a + x.timeSec, 0) / 3) };
        workouts.push({ ...base, type: 'HYROX Engine', title: 'HYROX Engine — Erg & Sled Intervals', durationMin: 60, intensity: 8, exercises: engineSession(week), run });
        break;
      }
      case 4: {
        if (week === 5 || week === 9) {
          const ids = ['sledPush', 'sledPull', 'wallBalls'];
          workouts.push({
            ...base,
            type: 'HYROX',
            title: 'Doubles Partner Practice',
            durationMin: 70,
            intensity: 7,
            exercises: ids.map((id) => STATION_EXERCISE[id]),
            stations: stationResults(week, ids),
            run: makeRun('Compromised', week),
          });
        } else {
          const kind = FRIDAY_RUNS[week];
          const run = makeRun(kind, week);
          workouts.push({
            ...base,
            type: 'Running',
            title: `${kind} Run`,
            durationMin: runMinutes(run) + 10,
            intensity: kind === 'Easy' ? 5 : kind === 'Long' ? 6 : kind === '5K Time Trial' ? 9 : 8,
            exercises: [],
            run,
          });
        }
        break;
      }
      case 6: {
        const full = week === 11;
        const first = ['skierg', 'sledPush', 'sledPull', 'burpeeBroadJump'];
        const second = ['rowing', 'farmersCarry', 'sandbagLunges', 'wallBalls'];
        const ids = full ? [...first, ...second] : week % 2 === 0 ? first : second;
        const run = makeRun('Compromised', week);
        const stations = stationResults(week, ids);
        if (full) {
          // Race-style full simulation: 8 × (1 km run + station) at women's open weights.
          run.distanceKm = 8;
          const splits = stations.map((st, i) => ({ station: st.station, runSec: Math.round(run.paceSecPerKm + (i === 0 ? -12 : i * 2) + noise(8)), stationSec: st.timeSec }));
          run.paceSecPerKm = Math.round(splits.reduce((a, x) => a + x.runSec, 0) / 8);
          const total = splits.reduce((a, x) => a + x.runSec + x.stationSec, 0);
          workouts.push({
            ...base,
            type: 'HYROX',
            title: 'HYROX Full Sim',
            durationMin: Math.ceil(total / 60),
            intensity: 9,
            exercises: stations.map((st) => {
              const e = STATION_EXERCISE[st.station];
              return e.distanceM
                ? { ...e, sets: 1, distanceM: e.distanceM * 2, durationSec: st.timeSec, creditSets: 4 }
                : { ...e, sets: 1, reps: (e.reps ?? 0) * 2, creditSets: 4 };
            }),
            stations,
            hyrox: { sim: 'full', division: { sex: 'female', category: 'open' }, splits },
            run,
          });
          break;
        }
        workouts.push({
          ...base,
          type: 'HYROX',
          title: `HYROX Station Practice (Stations ${week % 2 === 0 ? '1–4' : '5–8'})`,
          durationMin: 75,
          intensity: 8,
          exercises: ids.map((id) => STATION_EXERCISE[id]),
          stations,
          run,
        });
        break;
      }
    }
  }
  return workouts;
}


/** Per-athlete variation for demonstration data. */
export interface SampleProfile {
  seed: number;
  /** Multiplier on all lifting loads. */
  liftScale: number;
  /** Seconds per km added to every run (negative = faster). */
  paceShiftSec: number;
}

export const DEFAULT_SAMPLE: SampleProfile = { seed: 20261017, liftScale: 1, paceShiftSec: 0 };

/** Generates an athlete's demonstration workouts (deterministic per profile). */
export function generateSample(profile: SampleProfile): { workouts: Workout[] } {
  rand = mulberry32(profile.seed);
  liftScale = profile.liftScale;
  paceShiftSec = profile.paceShiftSec;
  const workouts = buildWorkouts();
  return { workouts };
}

const defaultSample = generateSample(DEFAULT_SAMPLE);
export const SAMPLE_WORKOUTS: Workout[] = defaultSample.workouts;
