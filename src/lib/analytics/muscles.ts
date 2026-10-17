import { addDays, startOfWeek } from '../dates';
import { EXERCISE_BY_NAME } from '../../data/exercises';
import { MUSCLES, MUSCLE_BY_ID } from '../../data/muscles';
import { DATA_START, DEMO_TODAY } from '../../data/mockData';
import type { ExerciseEntry, MuscleGroup, Workout } from '../../data/types';
import { sortByDate, workoutsBetween } from './common';
import { liftHistory, liftStrength } from './strength';

export type CoverageStatus = 'within' | 'below' | 'significant' | 'nodata';

export const COVERAGE_META: Record<CoverageStatus, { label: string; color: string; soft: string; text: string }> = {
  within: { label: 'Within target', color: '#22a35a', soft: '#dcfce7', text: 'text-green-700' },
  below: { label: 'Below target', color: '#eab308', soft: '#fef9c3', text: 'text-yellow-700' },
  significant: { label: 'Significantly below', color: '#e34948', soft: '#fee2e2', text: 'text-red-700' },
  nodata: { label: 'No data', color: '#cbd5e1', soft: '#f1f5f9', text: 'text-slate-500' },
};

/** Muscles credited by one exercise: primary = 1 set per set, secondary = 0.5. */
export function exerciseMuscles(e: ExerciseEntry): { primary: MuscleGroup[]; secondary: MuscleGroup[]; factor: number } {
  const info = EXERCISE_BY_NAME[e.name];
  if (info) return { primary: info.primary, secondary: info.secondary, factor: info.conditioning ? 0.5 : 1 };
  return { primary: e.customMuscles ?? [], secondary: [], factor: 1 };
}

export function setCredits(workouts: Workout[]): Record<MuscleGroup, number> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m.id, 0])) as Record<MuscleGroup, number>;
  for (const w of workouts)
    for (const e of w.exercises) {
      const { primary, secondary, factor } = exerciseMuscles(e);
      primary.forEach((m) => (out[m] += e.sets * factor));
      secondary.forEach((m) => (out[m] += e.sets * factor * 0.5));
    }
  return out;
}

export const workoutMuscles = (w: Workout): MuscleGroup[] => {
  const set = new Set<MuscleGroup>();
  w.exercises.forEach((e) => exerciseMuscles(e).primary.forEach((m) => set.add(m)));
  return MUSCLES.map((m) => m.id).filter((m) => set.has(m));
};

export const hitsMuscle = (w: Workout, m: MuscleGroup) =>
  w.exercises.some((e) => {
    const { primary, secondary } = exerciseMuscles(e);
    return primary.includes(m) || secondary.includes(m);
  });

export function coverageStatus(sets: number, target: number, hasAnyData: boolean): CoverageStatus {
  if (!hasAnyData) return 'nodata';
  const r = sets / target;
  if (r >= 0.8) return 'within';
  if (r >= 0.5) return 'below';
  return 'significant';
}

export type CoverageWindow = '7d' | '4w';

export interface MuscleCoverage {
  id: MuscleGroup;
  label: string;
  weeklySets: number;
  target: number;
  pct: number;
  status: CoverageStatus;
}

/** Weekly sets per muscle for the last 7 days, or averaged over the last 4 weeks. */
export function muscleCoverage(workouts: Workout[], window: CoverageWindow, today = DEMO_TODAY): MuscleCoverage[] {
  const days = window === '7d' ? 7 : 28;
  const from = addDays(today, -(days - 1));
  const credits = setCredits(workoutsBetween(workouts, from, today));
  const allCredits = setCredits(workouts);
  return MUSCLES.map((m) => {
    const weeklySets = Math.round((credits[m.id] / (days / 7)) * 10) / 10;
    return {
      id: m.id,
      label: m.label,
      weeklySets,
      target: m.weeklyTargetSets,
      pct: Math.round((weeklySets / m.weeklyTargetSets) * 100),
      status: coverageStatus(weeklySets, m.weeklyTargetSets, allCredits[m.id] > 0),
    };
  });
}

export interface MuscleDetail {
  id: MuscleGroup;
  label: string;
  target: number;
  setsThisWeek: number;
  avgWeeklySets: number;
  lastTrained?: string;
  sessionsPerWeek: number;
  exercises: { name: string; sets: number; lastDate: string; primary: boolean }[];
  progression: { name: string; changePct: number; latest: number; unit: string }[];
  weekly: { week: string; sets: number; target: number }[];
}

export function muscleDetail(workouts: Workout[], muscle: MuscleGroup, today = DEMO_TODAY): MuscleDetail {
  const info = MUSCLE_BY_ID[muscle];
  const last7 = workoutsBetween(workouts, addDays(today, -6), today);
  const last28 = workoutsBetween(workouts, addDays(today, -27), today);
  const hits = sortByDate(workouts.filter((w) => w.date <= today && hitsMuscle(w, muscle)));

  const exMap = new Map<string, { name: string; sets: number; lastDate: string; primary: boolean }>();
  for (const w of last28)
    for (const e of w.exercises) {
      const { primary, secondary } = exerciseMuscles(e);
      const isPrimary = primary.includes(muscle);
      if (!isPrimary && !secondary.includes(muscle)) continue;
      const cur = exMap.get(e.name) ?? { name: e.name, sets: 0, lastDate: w.date, primary: isPrimary };
      cur.sets += e.sets;
      if (w.date > cur.lastDate) cur.lastDate = w.date;
      exMap.set(e.name, cur);
    }

  const progression = [...exMap.values()]
    .filter((e) => EXERCISE_BY_NAME[e.name]?.tracked && e.primary)
    .map((e) => {
      const h = liftHistory(workouts, e.name);
      const first = h[0];
      const last = h[h.length - 1];
      return {
        name: e.name,
        latest: liftStrength(last),
        unit: e.name === "Farmer's Carry" ? 'kg/hand' : 'kg e1RM',
        changePct: ((liftStrength(last) - liftStrength(first)) / liftStrength(first)) * 100,
      };
    });

  const weekly: MuscleDetail['weekly'] = [];
  for (let w = startOfWeek(DATA_START); w <= today; w = addDays(w, 7)) {
    weekly.push({ week: w, sets: setCredits(workoutsBetween(workouts, w, addDays(w, 6)))[muscle], target: info.weeklyTargetSets });
  }

  return {
    id: muscle,
    label: info.label,
    target: info.weeklyTargetSets,
    setsThisWeek: setCredits(last7)[muscle],
    avgWeeklySets: Math.round((setCredits(last28)[muscle] / 4) * 10) / 10,
    lastTrained: hits[hits.length - 1]?.date,
    sessionsPerWeek: Math.round((last28.filter((w) => hitsMuscle(w, muscle)).length / 4) * 10) / 10,
    exercises: [...exMap.values()].sort((a, b) => b.sets - a.sets),
    progression,
    weekly,
  };
}
