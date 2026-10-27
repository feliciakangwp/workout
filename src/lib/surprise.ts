import { EXERCISE_BY_NAME, type ExerciseInfo } from '../data/exercises';
import { MUSCLE_BY_ID } from '../data/muscles';
import type { CustomExercise, EntryMode, MuscleGroup, Workout, WorkoutType } from '../data/types';
import { muscleCoverage } from './analytics/muscles';
import { avgPace, runs } from './analytics/running';
import { addDays } from './dates';
import { fmtTime } from './format';

/** One item of a generated workout, in the order it is done. */
export type SurpriseItem =
  | { kind: 'exercise'; name: string; sets: number; mode?: EntryMode; reps?: number; weightKg?: number; distanceM?: number; timeSec?: number }
  | { kind: 'run'; km: number; timeSec: number };

export interface Surprise {
  title: string;
  items: SurpriseItem[];
  durationMin: number;
  /** Why these were picked: focus muscles, skipped exercises, structure. */
  notes: string[];
}

type Region = 'lower' | 'upper' | 'core';
const LOWER: MuscleGroup[] = ['quadriceps', 'hamstrings', 'glutes', 'calves'];
const UPPER: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
/** Muscle groups a full-body session must reach (as a primary or secondary muscle). */
const FULL_BODY: MuscleGroup[] = ['quadriceps', 'hamstrings', 'glutes', 'chest', 'back', 'shoulders', 'core'];

const regionOf = (e: ExerciseInfo): Region => (e.primary.some((m) => LOWER.includes(m)) ? 'lower' : e.primary.some((m) => UPPER.includes(m)) ? 'upper' : 'core');

const STRENGTH_BASE = [
  'Squat', 'Romanian Deadlift', 'Bulgarian Split Squat', 'Hip Thrust', 'Goblet Squat', 'Walking Lunges', 'Calf Raise',
  'Chest Press', 'Lat Pulldown', 'Shoulder Press', 'Seated Cable Row', 'Bent-over Row', 'Push-up', 'Bicep Curl', 'Tricep Dip', 'Renegade Row',
  'Plank', 'Russian Twist',
];
const ENGINE_BASE = [
  'SkiErg', 'Row Erg', 'Assault Bike', 'Bike Erg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', "Farmer's Carry (HYROX)", 'Sandbag Lunges', 'Wall Balls',
  'Kettlebell Swing', 'Thruster', 'Burpee', 'Box Jump', 'Goblet Squat', 'Push-up', 'Renegade Row', 'Plank', 'Russian Twist',
];
/** Distance work: metres per set and seconds per metre (rough, for the time estimate). */
const DISTANCE: Record<string, { m: number; secPerM: number }> = {
  SkiErg: { m: 1000, secPerM: 0.26 },
  'Row Erg': { m: 1000, secPerM: 0.25 },
  'Assault Bike': { m: 2000, secPerM: 0.12 },
  'Bike Erg': { m: 2000, secPerM: 0.11 },
  'Sled Push': { m: 50, secPerM: 2.2 },
  'Sled Pull': { m: 50, secPerM: 2.2 },
  'Burpee Broad Jump': { m: 80, secPerM: 3 },
  "Farmer's Carry (HYROX)": { m: 200, secPerM: 0.7 },
  'Sandbag Lunges': { m: 100, secPerM: 2.5 },
};
const REPS: Record<string, number> = { 'Wall Balls': 30, 'Kettlebell Swing': 20, Thruster: 15, Burpee: 15, 'Box Jump': 15, 'Goblet Squat': 15, 'Push-up': 15, 'Renegade Row': 12, 'Russian Twist': 30 };
const SEC_PER_REP = 3;

const rand = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

interface Ctx {
  /** Exercise library plus the athlete's own exercises. */
  lib: Record<string, ExerciseInfo>;
  /** The athlete's own exercises: favoured, since they chose them. */
  own: Set<string>;
  need: Record<MuscleGroup, number>;
  bestKg: Map<string, number>;
  skipped: Set<string>;
  focus: MuscleGroup[];
}

/** Training need per muscle (0 = on target, 1 = untrained) this week, yesterday's exercises and best weights. */
function context(workouts: Workout[], date: string, customs: CustomExercise[]): Ctx {
  const logged = workouts.filter((w) => w.date <= date);
  const cov = muscleCoverage(logged, '7d', date);
  const need = Object.fromEntries(cov.map((c) => [c.id, Math.max(0, 1 - c.pct / 100) + 0.1])) as Record<MuscleGroup, number>;
  const yesterday = addDays(date, -1);
  const skipped = new Set(logged.filter((w) => w.date === yesterday).flatMap((w) => w.exercises.map((e) => e.name)));
  const bestKg = new Map<string, number>();
  for (const w of logged) for (const e of w.exercises) if (e.weightKg && (!e.mode || e.mode === 'reps')) bestKg.set(e.name, Math.max(bestKg.get(e.name) ?? 0, e.weightKg));
  const focus = [...cov].sort((a, b) => a.pct - b.pct).filter((c) => c.pct < 100).slice(0, 3).map((c) => c.id);
  // Custom exercises: their chosen muscle groups count as primary.
  const lib: Record<string, ExerciseInfo> = { ...EXERCISE_BY_NAME };
  for (const c of customs) lib[c.name] = { name: c.name, primary: c.muscles, secondary: [], measure: c.measure };
  return { lib, own: new Set(customs.map((c) => c.name)), need, bestKg, skipped, focus };
}

/**
 * Picks `count` exercises from a pool, favouring under-trained muscles (with some
 * randomness) and spreading over muscles not yet worked in this session.
 */
function pick(pool: string[], count: number, ctx: Ctx, worked: Set<MuscleGroup>, taken: Set<string>): ExerciseInfo[] {
  const out: ExerciseInfo[] = [];
  for (let i = 0; i < count; i++) {
    const options = pool.map((n) => ctx.lib[n]).filter((e) => e && !taken.has(e.name) && !ctx.skipped.has(e.name));
    if (!options.length) break;
    const score = (e: ExerciseInfo) =>
      (e.primary.reduce((a, m) => a + ctx.need[m] * (worked.has(m) ? 0.35 : 1), 0) + e.secondary.reduce((a, m) => a + 0.4 * ctx.need[m] * (worked.has(m) ? 0.35 : 1), 0)) *
      (0.7 + Math.random() * 0.6) *
      // Own exercises usually work one muscle group, so they'd lose to compound lifts without a boost.
      (ctx.own.has(e.name) ? 2 : 1);
    const best = options.reduce((a, e) => (score(e) > score(a) ? e : a));
    out.push(best);
    taken.add(best.name);
    [...best.primary, ...best.secondary].forEach((m) => worked.add(m));
  }
  return out;
}

/** Adds exercises until every full-body muscle group is reached. */
function fillGaps(pool: string[], ctx: Ctx, worked: Set<MuscleGroup>, taken: Set<string>, max: number): ExerciseInfo[] {
  const extra: ExerciseInfo[] = [];
  for (const m of FULL_BODY) {
    if (worked.has(m) || extra.length >= max) continue;
    const e = pool.map((n) => ctx.lib[n]).find((x) => x && !taken.has(x.name) && !ctx.skipped.has(x.name) && x.primary.includes(m));
    if (!e) continue;
    extra.push(e);
    taken.add(e.name);
    [...e.primary, ...e.secondary].forEach((x) => worked.add(x));
  }
  return extra;
}

const focusNote = (ctx: Ctx) => (ctx.focus.length ? `Focus on ${ctx.focus.map((m) => MUSCLE_BY_ID[m].label.toLowerCase()).join(', ')}: least trained this week.` : 'Every muscle group is on target this week: a balanced session.');
const ownNote = (ctx: Ctx, items: SurpriseItem[]) => {
  const mine = items.flatMap((i) => (i.kind === 'exercise' && ctx.own.has(i.name) ? [i.name] : []));
  return mine.length ? `Includes your own exercise${mine.length > 1 ? 's' : ''}: ${mine.join(', ')}.` : '';
};
const skipNote = (ctx: Ctx) => (ctx.skipped.size ? `Left out from yesterday: ${[...ctx.skipped].slice(0, 4).join(', ')}${ctx.skipped.size > 4 ? ` and ${ctx.skipped.size - 4} more` : ''}.` : '');

/** About an hour of strength: lower body first, then upper body, then a core finisher. */
/** The athlete's own exercises saved for this workout type (Strength: rep-based or timed only). */
const customPool = (customs: CustomExercise[], type: WorkoutType) =>
  customs.filter((c) => c.types.includes(type) && c.muscles.length && (type !== 'Strength' || c.measure !== 'distanceTime')).map((c) => c.name);

export function surpriseStrength(workouts: Workout[], date: string, customs: CustomExercise[] = []): Surprise {
  const ctx = context(workouts, date, customs);
  const STRENGTH_POOL = [...STRENGTH_BASE, ...customPool(customs, 'Strength')];
  const worked = new Set<MuscleGroup>();
  const taken = new Set<string>();
  const byRegion = (r: Region) => STRENGTH_POOL.filter((n) => regionOf(ctx.lib[n]) === r);
  const lower = pick(byRegion('lower'), 3, ctx, worked, taken);
  const upper = pick(byRegion('upper'), 3, ctx, worked, taken);
  const core = pick(byRegion('core'), 1, ctx, worked, taken);
  const gaps = fillGaps(STRENGTH_POOL, ctx, worked, taken, 2);
  const order = { lower: 0, upper: 1, core: 2 };
  const list = [...lower, ...upper, ...gaps, ...core].sort((a, b) => order[regionOf(a)] - order[regionOf(b)]);

  let sec = 5 * 60; // warm-up
  const items: SurpriseItem[] = list.map((e) => {
    if (e.measure === 'time') {
      sec += 3 * (45 + 45);
      return { kind: 'exercise', name: e.name, sets: 3, timeSec: 45 };
    }
    // Main lifts: 4 heavier sets; accessories: 3 lighter sets of 12. Start around 75% of the best weight.
    const main = !!e.tracked;
    const sets = main ? 4 : 3;
    sec += sets * (main ? 40 + 120 : 40 + 75);
    const best = ctx.bestKg.get(e.name);
    return { kind: 'exercise', name: e.name, sets, reps: REPS[e.name] ?? (main ? 8 : 12), weightKg: best ? roundTo(best * (main ? 0.8 : 0.75), 2.5) : undefined };
  });
  return {
    title: 'Surprise Strength',
    items,
    durationMin: Math.max(45, Math.min(70, Math.round(sec / 60))),
    notes: [focusNote(ctx), 'Lower body first, then upper body, with a core finisher. Weights start around 75–80% of your best.', ownNote(ctx, items), skipNote(ctx)].filter(Boolean),
  };
}

type Style = 'time' | 'distance' | 'mix';
type Runs = 'hyrox' | 'none' | 'few';

/** About an hour of HYROX Engine: time, distance or mixed work, with runs between stations, a couple of runs, or none. */
export function surpriseEngine(workouts: Workout[], date: string, customs: CustomExercise[] = []): Surprise {
  const ctx = context(workouts, date, customs);
  const ENGINE_POOL = [...ENGINE_BASE, ...customPool(customs, 'HYROX Engine')];
  const style: Style = rand(['time', 'distance', 'mix'] as const);
  const runPattern: Runs = rand(['hyrox', 'hyrox', 'none', 'few'] as const);
  const pace = Math.round(avgPace(runs(workouts.filter((w) => w.date <= date && w.type === 'Running'))) || 360);
  const sets = runPattern === 'hyrox' ? 1 : runPattern === 'few' ? 2 : 3;

  const item = (e: ExerciseInfo): { item: SurpriseItem; sec: number } => {
    const dist = DISTANCE[e.name];
    const mode: EntryMode = e.measure === 'time' || (e.measure === 'distanceTime' && !dist) ? 'time' : style === 'time' ? 'time' : style === 'distance' ? (dist ? 'distance' : 'reps') : rand(dist ? (['distance', 'time'] as const) : (['reps', 'time'] as const));
    const best = ctx.bestKg.get(e.name);
    const weightKg = best ? roundTo(best * 0.8, 2) : undefined;
    if (mode === 'time') {
      const t = e.measure === 'time' ? 60 : rand([90, 120, 150, 180]);
      return { item: { kind: 'exercise', name: e.name, sets, mode, timeSec: t, weightKg }, sec: sets * t + (sets - 1) * 60 + 45 };
    }
    if (mode === 'distance') return { item: { kind: 'exercise', name: e.name, sets, mode, distanceM: dist.m, weightKg }, sec: sets * dist.m * dist.secPerM + (sets - 1) * 60 + 45 };
    const reps = REPS[e.name] ?? 20;
    return { item: { kind: 'exercise', name: e.name, sets, mode: 'reps', reps, weightKg }, sec: sets * reps * SEC_PER_REP + (sets - 1) * 60 + 45 };
  };

  // Lower, upper and core work, favouring what's least trained, then fill the session to about an hour.
  const worked = new Set<MuscleGroup>();
  const taken = new Set<string>();
  const byRegion = (r: Region) => ENGINE_POOL.filter((n) => regionOf(ctx.lib[n]) === r);
  const chosen = [...pick(byRegion('lower'), 2, ctx, worked, taken), ...pick(byRegion('upper'), 2, ctx, worked, taken), ...pick(byRegion('core'), 1, ctx, worked, taken)];
  chosen.push(...fillGaps(ENGINE_POOL, ctx, worked, taken, 2));
  const shuffled = chosen.sort(() => Math.random() - 0.5);

  const target = 58 * 60;
  const items: SurpriseItem[] = [];
  let sec = 5 * 60; // warm-up
  const run = () => {
    items.push({ kind: 'run', km: 1, timeSec: pace });
    sec += pace;
  };
  const queue = [...shuffled];
  let added = 0;
  while (sec < target - 4 * 60) {
    let e = queue.shift();
    if (!e) e = pick(ENGINE_POOL, 1, ctx, worked, taken)[0];
    if (!e) break;
    if (runPattern === 'hyrox') run();
    else if (runPattern === 'few' && (added === 2 || added === 5)) run();
    const x = item(e);
    items.push(x.item);
    sec += x.sec;
    added++;
  }
  const runCount = items.filter((i) => i.kind === 'run').length;
  const styleLabel = { time: 'time focus', distance: 'distance focus', mix: 'mixed' }[style];
  const runLabel = runPattern === 'hyrox' ? 'a 1 km run before each station, HYROX style' : runCount ? `${runCount} run${runCount === 1 ? '' : 's'} in between` : 'no runs';
  return {
    title: `Surprise Engine · ${styleLabel}`,
    items,
    durationMin: Math.round(sec / 60),
    notes: [
      focusNote(ctx),
      `${styleLabel[0].toUpperCase()}${styleLabel.slice(1)} with ${runLabel}. Runs at your average pace (${fmtTime(pace)}/km). Tap again for a different mix.`,
      ownNote(ctx, items),
      skipNote(ctx),
    ].filter(Boolean),
  };
}
