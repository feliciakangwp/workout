/**
 * DEMONSTRATION DATA
 * -------------------------------------------------------------
 * Every number shown in the dashboard is derived from the records
 * generated in this file (plus any workouts added during the session).
 * The data is synthetic but follows a realistic HYROX training block:
 * steady strength progression, improving running economy, a sick week and
 * day-to-day noise. Each demo athlete's seed gives them their own weekly
 * routines (which change week to week), session mix, strong and weak
 * stations and sims; the same seed always gives the same data.
 */
import { dateRange, diffDays, weekdayIndex } from '../lib/dates';
import { round } from '../lib/format';
import { STATIONS } from './stations';
import type { ExerciseEntry, Goals, RaceResult, RunData, RunKind, SimType, StationResult, Workout } from './types';

/** The prototype's fixed "today" so the demo data always lines up with the calendar. */
export const DEMO_TODAY = '2026-10-17';
/** First day of the 13-week demonstration block (a Monday). */
export const DATA_START = '2026-07-20';

function raceResult(runs: number[], stations: number[], roxzoneSec: number): RaceResult {
  const splits = STATIONS.map((st, i) => ({ station: st.id, runSec: runs[i], stationSec: stations[i] }));
  return { roxzoneSec, totalSec: runs.reduce((a, b) => a + b, 0) + stations.reduce((a, b) => a + b, 0) + roxzoneSec, splits };
}

export const DEFAULT_GOALS: Goals = {
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
/** Training-block progress (0 → 1 over the 13-week block, then holding near the top). */
const progress = (week: number) => Math.min(1.08, week / (TOTAL_WEEKS - 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

/**
 * Per-athlete traits drawn from the seed, so each demo athlete trains
 * differently: weekly routines, strong and weak stations, a sick week.
 */
interface Traits {
  focus: 'hybrid' | 'runner' | 'strength';
  patterns: Slot[][];
  illnessWeek: number;
  skipRate: number;
  stationBias: Record<string, number>;
}
let traits: Traits;

type Slot = 'F45' | 'Strength' | 'Engine' | 'Run' | 'Long' | 'HYROX' | 'Recovery' | 'Rest';
/** Weekly routines (Monday → Sunday). Each athlete uses a few of these and changes week to week. */
const PATTERNS: Slot[][] = [
  ['F45', 'Recovery', 'Strength', 'Engine', 'Run', 'F45', 'HYROX'],
  ['Strength', 'Run', 'F45', 'Recovery', 'Engine', 'HYROX', 'Long'],
  ['Run', 'F45', 'Engine', 'Strength', 'Rest', 'HYROX', 'Recovery'],
  ['F45', 'Strength', 'Run', 'Rest', 'F45', 'Engine', 'Long'],
  ['Strength', 'F45', 'Recovery', 'Run', 'Engine', 'Rest', 'HYROX'],
  ['Run', 'Strength', 'F45', 'Engine', 'Recovery', 'Long', 'HYROX'],
  ['Engine', 'Run', 'Strength', 'F45', 'Rest', 'HYROX', 'Long'],
];

function makeTraits(): Traits {
  const focus = pick(['hybrid', 'runner', 'strength'] as const);
  const order = [...PATTERNS.keys()].sort(() => rand() - 0.5);
  const patterns = order.slice(0, 3).map((i) =>
    PATTERNS[i].map((slot): Slot => {
      // Runners swap some classes for runs; strength athletes for lifting.
      if (focus === 'runner' && slot === 'F45' && rand() < 0.5) return 'Run';
      if (focus === 'strength' && (slot === 'F45' || slot === 'Run') && rand() < 0.4) return 'Strength';
      return slot;
    }),
  );
  const stationBias = Object.fromEntries(STATIONS.map((st) => [st.id, noise(0.12)]));
  return { focus, patterns, illnessWeek: 3 + Math.floor(rand() * 7), skipRate: 0.04 + rand() * 0.06, stationBias };
}

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
  {
    title: 'F45 — Cardio Circuit',
    build: () => [
      { name: 'Assault Bike', sets: 4, distanceM: 500, durationSec: Math.round(62 + noise(5)) },
      { name: 'Burpee', sets: 4, reps: 12 },
      { name: 'Box Jump', sets: 3, reps: 12 },
      { name: 'Kettlebell Swing', sets: 4, reps: 20, weightKg: 12 },
      { name: 'Plank', sets: 2, durationSec: 60 },
    ],
  },
  {
    title: 'F45 — Glutes & Core',
    build: (p) => [
      { name: 'Hip Thrust', sets: 4, reps: 12, weightKg: round(lerp(40, 55, p), 5) },
      { name: 'Walking Lunges', sets: 3, reps: 16, weightKg: round(lerp(6, 8, p), 1) },
      { name: 'Calf Raise', sets: 3, reps: 15, weightKg: 10 },
      { name: 'Russian Twist', sets: 3, reps: 24, weightKg: 6 },
      { name: 'Plank', sets: 3, durationSec: 50 },
    ],
  },
  {
    title: 'F45 — Push & Pull',
    build: (p) => [
      { name: 'Push-up', sets: 4, reps: Math.round(lerp(8, 13, p)) },
      { name: 'Bent-over Row', sets: 4, reps: 10, weightKg: round(lerp(9, 12, p), 1) },
      { name: 'Shoulder Press', sets: 3, reps: 12, weightKg: round(lerp(6, 8, p), 1) },
      { name: 'Bicep Curl', sets: 3, reps: 12, weightKg: round(lerp(5, 7, p), 1) },
      { name: 'Row Erg', sets: 3, distanceM: 300, durationSec: Math.round(68 + noise(4)) },
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
const LIFT: Record<string, LiftPlan> = {
  squat: { name: 'Squat', sets: 4, reps: 6, start: 45, end: 57.5, step: 2.5 },
  rdl: { name: 'Romanian Deadlift', sets: 4, reps: 8, start: 50, end: 65, step: 2.5 },
  bss: { name: 'Bulgarian Split Squat', sets: 3, reps: 8, start: 10, end: 14, step: 1 },
  lat: { name: 'Lat Pulldown', sets: 3, reps: 10, start: 35, end: 43, step: 1 },
  chest: { name: 'Chest Press', sets: 3, reps: 10, start: 25, end: 32.5, step: 2.5 },
  shoulder: { name: 'Shoulder Press', sets: 3, reps: 10, start: 9, end: 12, step: 1 },
  farmer: { name: "Farmer's Carry", sets: 4, reps: 40, start: 20, end: 26, step: 2 },
};
/** Strength days rotate between lower, upper and full-body sessions. */
const STRENGTH_DAYS: { title: string; lifts: string[]; extras: (p: number) => ExerciseEntry[] }[] = [
  {
    title: 'Strength — Lower Body',
    lifts: ['squat', 'rdl', 'bss'],
    extras: (p) => [
      { name: 'Hip Thrust', sets: 3, reps: 10, weightKg: round(lerp(50, 70, p), 5) },
      { name: 'Calf Raise', sets: 3, reps: 15, weightKg: round(lerp(16, 22, p), 2) },
    ],
  },
  {
    title: 'Strength — Upper Body',
    lifts: ['chest', 'lat', 'shoulder'],
    extras: (p) => [
      { name: 'Seated Cable Row', sets: 3, reps: 12, weightKg: round(lerp(30, 36, p), 2) },
      { name: 'Bicep Curl', sets: 2, reps: 12, weightKg: round(lerp(6, 8, p), 1) },
      { name: 'Tricep Dip', sets: 3, reps: 10 },
    ],
  },
  {
    title: 'Strength — Full Body',
    lifts: ['squat', 'rdl', 'lat', 'chest', 'farmer'],
    extras: (p) => [{ name: 'Hip Thrust', sets: 3, reps: 10, weightKg: round(lerp(50, 70, p), 5) }],
  },
];
let strengthCount = 0;

function strengthSession(week: number): { title: string; exercises: ExerciseEntry[] } {
  const p = progress(week);
  const day = STRENGTH_DAYS[strengthCount++ % STRENGTH_DAYS.length];
  const dip = week === traits.illnessWeek + 1 ? 0.92 : 1; // first sessions back after illness
  const lifts = day.lifts.map((key): ExerciseEntry => {
    const l = LIFT[key];
    const start = l.start * liftScale;
    const target = lerp(start, l.end * liftScale, Math.pow(Math.min(1, p), 0.85)) * dip + noise(l.step * 0.5);
    const reps = l.reps + (rand() < 0.2 ? 1 : 0) - (rand() < 0.1 ? 1 : 0);
    return { name: l.name, sets: l.sets + (rand() < 0.15 ? 1 : 0), reps, weightKg: Math.max(round(start, l.step), round(target, l.step)) };
  });
  return { title: day.title, exercises: [...lifts, ...day.extras(p)] };
}

interface EngineSession {
  title: string;
  exercises: ExerciseEntry[];
  /** Runs in km, in the order done with the exercises. */
  runs: number[];
  sequence: ('run' | 'exercise')[];
}
/** HYROX Engine formats: runs before, after or between the exercises. */
function engineSession(week: number): EngineSession {
  const p = progress(week);
  const formats: (() => EngineSession)[] = [
    () => ({
      title: 'HYROX Engine — Erg & Sled Intervals',
      exercises: [
        { name: 'SkiErg', sets: 5, distanceM: 250, durationSec: Math.round(lerp(64, 57, p) + noise(2)) },
        { name: 'Row Erg', sets: 5, distanceM: 250, durationSec: Math.round(lerp(60, 54, p) + noise(2)) },
        { name: 'Sled Push', sets: 4, reps: 25 },
        { name: 'Wall Balls', sets: 4, reps: week > 6 ? 25 : 20, weightKg: 4 },
      ],
      runs: [1, 1, 1],
      sequence: ['run', 'exercise', 'exercise', 'run', 'exercise', 'exercise', 'run'],
    }),
    () => ({
      title: 'HYROX Engine — Run & Wall Ball EMOM',
      exercises: [
        { name: 'Wall Balls', sets: 6, reps: 15, weightKg: 4 },
        { name: 'Burpee Broad Jump', sets: 3, reps: 20 },
      ],
      runs: [0.8, 0.8, 0.8, 0.8],
      sequence: ['run', 'exercise', 'run', 'run', 'exercise', 'run'],
    }),
    () => ({
      title: 'HYROX Engine — Ski & Row Ladder',
      exercises: [
        { name: 'SkiErg', sets: 4, distanceM: 500, durationSec: Math.round(lerp(132, 118, p) + noise(3)) },
        { name: 'Row Erg', sets: 4, distanceM: 500, durationSec: Math.round(lerp(122, 110, p) + noise(3)) },
        { name: 'Plank', sets: 3, durationSec: 60 },
      ],
      runs: [2],
      sequence: ['exercise', 'exercise', 'exercise', 'run'],
    }),
    () => ({
      title: 'HYROX Engine — Lunge & Carry Grinder',
      exercises: [
        { name: 'Sandbag Lunges', sets: 4, reps: 25, weightKg: 10 },
        { name: "Farmer's Carry (HYROX)", sets: 4, reps: 50, weightKg: 16 },
        { name: 'Sled Pull', sets: 3, reps: 25 },
      ],
      runs: [1, 1],
      sequence: ['run', 'exercise', 'exercise', 'exercise', 'run'],
    }),
  ];
  return pick(formats)();
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

/** Station times at full distance (scaled by `fraction` for half / ¾ sims). */
function stationResults(week: number, ids: string[], fraction = 1): StationResult[] {
  const p = Math.min(1, progress(week));
  return STATIONS.filter((s) => ids.includes(s.id)).map((s) => {
    const base = STATION_BASELINE[s.id] + traits.stationBias[s.id];
    const factor = base - (base - 1) * STATION_GAIN[s.id] * p + noise(0.03);
    return { station: s.id, timeSec: Math.round(s.targetSec * factor * fraction), fraction };
  });
}

function makeRun(kind: RunKind, week: number): RunData {
  const p = Math.min(1, progress(week));
  const sick = week === traits.illnessWeek || week === traits.illnessWeek + 1 ? 1 : 0;
  const profile: Record<RunKind, { km: [number, number]; pace: [number, number]; hr: [number, number] }> = {
    Easy: { km: [5.5, 8.5], pace: [382, 352], hr: [151, 146] },
    Long: { km: [9, 12], pace: [375, 350], hr: [153, 149] },
    Tempo: { km: [5, 7], pace: [336, 314], hr: [167, 164] },
    Intervals: { km: [5.5, 7.5], pace: [326, 305], hr: [170, 168] },
    '5K Time Trial': { km: [5, 5], pace: [331, 309], hr: [176, 175] },
    Walking: { km: [3, 6], pace: [660, 620], hr: [110, 105] },
    Compromised: { km: [4, 4], pace: [352, 326], hr: [171, 169] },
  };
  const pr = profile[kind];
  const runnerBonus = traits.focus === 'runner' ? -8 : traits.focus === 'strength' ? 6 : 0;
  return {
    kind,
    distanceKm: Math.round((lerp(pr.km[0], pr.km[1], p) + (kind === '5K Time Trial' || kind === 'Compromised' ? 0 : noise(0.9))) * 10) / 10,
    paceSecPerKm: Math.round(lerp(pr.pace[0], pr.pace[1], p) + noise(8) + sick * 9 + paceShiftSec + runnerBonus),
    avgHr: Math.round(lerp(pr.hr[0], pr.hr[1], p) + noise(3) + sick * 3),
  };
}

const runMinutes = (r: RunData) => Math.round((r.distanceKm * r.paceSecPerKm) / 60);

/** Occasional training-diary notes, by session type. */
const NOTE_POOL: Partial<Record<Workout['type'], string[]>> = {
  Running: ['Felt sluggish in the heat: kept it conversational.', 'Negative split, finished strong.', 'Legs heavy from yesterday.', 'Ran with the club, good company.', 'New shoes felt great.'],
  Strength: ['Felt strong today.', 'Grip gave out before legs did.', 'Short on sleep, kept loads steady.', 'Form check on squats: much better depth.'],
  'HYROX Engine': ['Compromised running is getting easier.', 'Wall balls broke into sets of 10.', 'Held pace on the last run.'],
  HYROX: ['Sled push still the weakest station.', 'Worked on transitions.', 'Paced the runs better than last time.'],
  F45: ['Packed class, great energy.', 'Coach pushed the tempo today.'],
  Recovery: ['Much needed after the week.', 'Hips feel looser.'],
};
const maybeNote = (type: Workout['type']) => (rand() < 0.18 ? pick(NOTE_POOL[type] ?? ['']) || undefined : undefined);

const RECOVERY_SESSIONS = [
  { title: 'Rest and recovery', min: 60 },
  { title: 'Mobility & stretching flow', min: 40 },
  { title: 'Yoga flow', min: 50 },
  { title: 'Easy swim', min: 35 },
  { title: 'Sauna + stretch', min: 45 },
];

/** Sims through the block: a half sim early, a ¾ sim mid-way and full sims late on. */
const SIM_WEEKS: Record<number, SimType> = { 3: 'half', 7: 'threeQuarter', 11: 'full', 15: 'full' };

function hyroxSession(base: Omit<Workout, 'type' | 'title' | 'durationMin' | 'intensity' | 'exercises'>, week: number): Workout {
  const sim = SIM_WEEKS[week];
  const run = makeRun('Compromised', week);
  if (sim) {
    // Race-style simulation: 8 × (1 km run + station), stations scaled for half / ¾ sims.
    const fraction = sim === 'half' ? 0.5 : sim === 'threeQuarter' ? 0.75 : 1;
    const stations = stationResults(week, STATIONS.map((s) => s.id), fraction);
    run.distanceKm = 8;
    const splits = stations.map((st, i) => ({ station: st.station, runSec: Math.round(run.paceSecPerKm + (i === 0 ? -12 : i * 2) + noise(9)), stationSec: st.timeSec }));
    run.paceSecPerKm = Math.round(splits.reduce((a, x) => a + x.runSec, 0) / 8);
    run.segments = splits.map((x) => ({ distanceKm: 1, timeSec: x.runSec }));
    const total = splits.reduce((a, x) => a + x.runSec + x.stationSec, 0);
    return {
      ...base,
      type: 'HYROX',
      title: `HYROX ${sim === 'half' ? 'Half' : sim === 'threeQuarter' ? '¾' : 'Full'} Sim`,
      durationMin: Math.ceil(total / 60),
      intensity: 9,
      exercises: stations.map((st) => {
        const e = STATION_EXERCISE[st.station];
        return e.distanceM
          ? { ...e, sets: 1, distanceM: e.distanceM * 2 * fraction, durationSec: st.timeSec, creditSets: 4 * fraction }
          : { ...e, sets: 1, reps: (e.reps ?? 0) * 2 * fraction, creditSets: 4 * fraction };
      }),
      stations,
      hyrox: { sim, division: { sex: 'female', category: 'open' }, splits },
      run,
    };
  }
  const groups = [
    { label: 'Stations 1–4', ids: ['skierg', 'sledPush', 'sledPull', 'burpeeBroadJump'] },
    { label: 'Stations 5–8', ids: ['rowing', 'farmersCarry', 'sandbagLunges', 'wallBalls'] },
    { label: 'Sleds & Wall Balls', ids: ['sledPush', 'sledPull', 'wallBalls'] },
    { label: 'Ergs & Carries', ids: ['skierg', 'rowing', 'farmersCarry'] },
  ];
  const g = pick(groups);
  return {
    ...base,
    type: 'HYROX',
    title: `HYROX Station Practice (${g.label})`,
    durationMin: 60 + Math.round(rand() * 25),
    intensity: 7 + Math.round(rand() * 2),
    exercises: g.ids.map((id) => STATION_EXERCISE[id]),
    stations: stationResults(week, g.ids),
    run,
  };
}

function buildWorkouts(until: string): Workout[] {
  const workouts: Workout[] = [];
  strengthCount = 0;
  traits = makeTraits();
  let weekPattern: Slot[] = traits.patterns[0];
  let fiveKWeek = -9;
  for (const date of dateRange(DATA_START, until)) {
    const week = Math.floor(diffDays(date, DATA_START) / 7);
    const dow = weekdayIndex(date);
    if (dow === 0) {
      weekPattern = pick(traits.patterns);
      // Sim weeks always include a HYROX day.
      if (SIM_WEEKS[week] && !weekPattern.includes('HYROX')) weekPattern = PATTERNS[0];
    }
    const sick = week === traits.illnessWeek && dow < 4;
    if (sick || rand() < traits.skipRate) continue;
    const p = progress(week);
    const base = { id: `s-${date}`, date, isSample: true };
    const slot = weekPattern[dow];

    switch (slot) {
      case 'Rest':
        break;
      case 'F45': {
        const tpl = pick(F45_TEMPLATES);
        workouts.push({ ...base, type: 'F45', title: tpl.title, durationMin: 45 + Math.round(rand() * 10), intensity: 6 + Math.round(rand() * 2), exercises: tpl.build(p), notes: maybeNote('F45') });
        break;
      }
      case 'Recovery': {
        const r = pick(RECOVERY_SESSIONS);
        workouts.push({ ...base, type: 'Recovery', title: r.title, durationMin: r.min, intensity: 2, exercises: [], notes: maybeNote('Recovery') });
        break;
      }
      case 'Strength': {
        const s = strengthSession(week);
        workouts.push({ ...base, type: 'Strength', title: s.title, durationMin: 55 + Math.round(rand() * 25), intensity: week === traits.illnessWeek + 1 ? 6 : 7 + Math.round(rand() * 2), exercises: s.exercises, notes: maybeNote('Strength') });
        break;
      }
      case 'Engine': {
        const e = engineSession(week);
        const pace = makeRun('Compromised', week).paceSecPerKm;
        const segments = e.runs.map((km, i) => ({ distanceKm: km, timeSec: Math.round(km * (pace + (i - 1) * 4 + noise(6))) }));
        const km = segments.reduce((a, x) => a + x.distanceKm, 0);
        const run: RunData = { kind: segments.length > 1 ? 'Intervals' : 'Compromised', distanceKm: Math.round(km * 10) / 10, segments, paceSecPerKm: Math.round(segments.reduce((a, x) => a + x.timeSec, 0) / km), avgHr: Math.round(165 + noise(4)) };
        workouts.push({ ...base, type: 'HYROX Engine', title: e.title, durationMin: 50 + Math.round(rand() * 20), intensity: 8, exercises: e.exercises, run, sequence: e.sequence, notes: maybeNote('HYROX Engine') });
        break;
      }
      case 'Run':
      case 'Long': {
        // A 5K test every few weeks; otherwise a mix of run types.
        let kind: RunKind = slot === 'Long' ? 'Long' : pick(['Easy', 'Easy', 'Tempo', 'Intervals'] as const);
        if (slot === 'Run' && week - fiveKWeek >= 3 && rand() < 0.5) {
          kind = '5K Time Trial';
          fiveKWeek = week;
        }
        const run = makeRun(kind, week);
        workouts.push({
          ...base,
          type: 'Running',
          title: `${kind} Run`,
          durationMin: runMinutes(run) + 8,
          intensity: kind === 'Easy' ? 5 : kind === 'Long' ? 6 : kind === '5K Time Trial' ? 9 : 8,
          exercises: [],
          run,
          notes: maybeNote('Running'),
        });
        break;
      }
      case 'HYROX':
        workouts.push({ ...hyroxSession(base, week), notes: maybeNote('HYROX') });
        break;
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

/**
 * Generates an athlete's demonstration workouts from the block start up to
 * `until` (deterministic per profile; later days only add to the end).
 */
export function generateSample(profile: SampleProfile, until = DEMO_TODAY): { workouts: Workout[] } {
  rand = mulberry32(profile.seed);
  liftScale = profile.liftScale;
  paceShiftSec = profile.paceShiftSec;
  return { workouts: buildWorkouts(until < DEMO_TODAY ? DEMO_TODAY : until) };
}
