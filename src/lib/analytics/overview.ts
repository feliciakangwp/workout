import { addDays, diffDays, startOfWeek, weekdayIndex } from '../dates';
import { fmtPace } from '../format';
import { TRACKED_LIFTS } from '../../data/exercises';
import { DEMO_TODAY } from '../../data/mockData';
import type { Workout } from '../../data/types';
import { buildBuckets, type RangeKey, workoutsBetween } from './common';
import { muscleCoverage } from './muscles';
import { avgPace, best5kPace, runs, totalKm } from './running';
import { liftSummary, strengthIndexAt } from './strength';

export interface PeriodStats {
  workouts: number;
  minutes: number;
  runKm: number;
  strengthIndex: number;
  musclesOnTarget: number;
}

/** This week so far (Mon → today) vs the same days of the previous week. */
export function weekComparison(workouts: Workout[], today = DEMO_TODAY) {
  const thisFrom = startOfWeek(today);
  const lastFrom = addDays(thisFrom, -7);
  const lastTo = addDays(today, -7);
  const stats = (from: string, to: string): PeriodStats => {
    const ws = workoutsBetween(workouts, from, to);
    return {
      workouts: ws.length,
      minutes: ws.reduce((a, w) => a + w.durationMin, 0),
      runKm: totalKm(runs(ws)),
      strengthIndex: strengthIndexAt(workouts, to) ?? 100,
      musclesOnTarget: muscleCoverage(workouts, '7d', to).filter((m) => m.status === 'within').length,
    };
  };
  const current = stats(thisFrom, today);
  return {
    current,
    previous: stats(lastFrom, lastTo),
    daysElapsed: diffDays(today, thisFrom) + 1,
  };
}

export interface TrendPoint {
  key: string;
  label: string;
  minutes: number;
  runKm: number;
  strengthIndex: number | null;
  completed: number;
  planned: number;
  adherence: number;
}

export function trainingTrends(workouts: Workout[], range: RangeKey, today = DEMO_TODAY): TrendPoint[] {
  return buildBuckets(range, today).map((b) => {
    const ws = workoutsBetween(workouts, b.from, b.to);
    const planned = diffDays(b.to, b.from) + 1; // one planned session per day
    const completedDays = new Set(ws.map((w) => w.date)).size;
    return {
      key: b.key,
      label: b.label,
      minutes: ws.reduce((a, w) => a + w.durationMin, 0),
      runKm: totalKm(runs(ws)),
      strengthIndex: strengthIndexAt(workouts, b.to),
      completed: completedDays,
      planned,
      adherence: Math.round((completedDays / planned) * 100),
    };
  });
}

export interface Insight {
  kind: 'improving' | 'attention' | 'focus';
  title: string;
  points: string[];
}

/** Rule-based prototype insights computed from the shared data. */
export function trainingInsights(workouts: Workout[], today = DEMO_TODAY): Insight[] {
  const lifts = TRACKED_LIFTS.map((n) => liftSummary(workouts, n)).filter((l) => l.history.length > 1);
  const topLift = [...lifts].sort((a, b) => b.changeSinceStartPct - a.changeSinceStartPct)[0];
  const allRuns = runs(workouts.filter((w) => w.date <= today));
  const recentRuns = allRuns.filter((r) => r.date > addDays(today, -28));
  const earlyRuns = allRuns.filter((r) => r.date <= addDays(allRuns[0]?.date ?? today, 27));
  const paceGain = avgPace(earlyRuns) - avgPace(recentRuns);
  const best = best5kPace(allRuns);

  const coverage = muscleCoverage(workouts, '4w', today);
  const low = coverage.filter((m) => m.status === 'significant' || m.status === 'below').sort((a, b) => a.pct - b.pct);
  const weekendLong = workouts.filter((w) => w.date > addDays(today, -28) && weekdayIndex(w.date) === 4 && w.type === 'Running').length;

  const improving: string[] = [];
  if (topLift) improving.push(`${topLift.name} strength is up ${topLift.changeSinceStartPct.toFixed(0)}% since the start of the block.`);
  if (paceGain > 0) improving.push(`Average running pace is ${Math.round(paceGain)} s/km faster than the first 4 weeks.`);
  if (best) improving.push(`Best 5 km+ pace is now ${fmtPace(best)}/km.`);

  const attention: string[] = [];
  low.slice(0, 3).forEach((m) => attention.push(`${m.label}: ${m.weeklySets} sets/week vs a target of ${m.target} (${m.pct}%).`));
  if (!attention.length) attention.push('All muscle groups are within target over the last 4 weeks.');

  const focus: string[] = [];
  if (low[0]) focus.push(`Add 2–3 sets of ${focusExercise(low[0].id)} to the Wednesday strength session.`);
  if (low[1]) focus.push(`Include ${focusExercise(low[1].id)} as a finisher in one F45 session.`);
  if (weekendLong < 2) focus.push('Build towards the 10 km goal with a weekly easy run that grows by ~0.5 km each week.');

  return [
    { kind: 'improving', title: 'What is improving', points: improving.slice(0, 3) },
    { kind: 'attention', title: 'What needs attention', points: attention.slice(0, 3) },
    { kind: 'focus', title: 'Suggested training focus', points: focus.slice(0, 3) },
  ];
}

const FOCUS: Record<string, string> = {
  quadriceps: 'goblet squats',
  hamstrings: 'Nordic curls or leg curls',
  glutes: 'hip thrusts',
  calves: 'single-leg calf raises',
  chest: 'push-ups or chest press',
  back: 'seated cable rows',
  shoulders: 'lateral raises',
  biceps: 'bicep curls',
  triceps: 'tricep pushdowns or dips',
  core: 'Pallof presses and dead bugs',
};
const focusExercise = (id: string) => FOCUS[id] ?? 'targeted accessory work';
