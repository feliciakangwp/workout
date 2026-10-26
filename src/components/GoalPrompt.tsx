import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import type { Goals, Workout } from '../data/types';
import { goalDistanceLabel } from '../lib/analytics';
import { addDays } from '../lib/dates';
import { fmtPace } from '../lib/format';
import { Modal } from './ui';

const CRUSHED_KEY = 'hyrox-dashboard.goals-crushed';
const askedKey = (id: string) => `hyrox-dashboard.goal-prompt.${id}`;

const read = (get: () => string | null, fallback: string) => {
  try {
    return get() ?? fallback;
  } catch {
    return fallback; // storage unavailable: prompts may show again next visit
  }
};
const write = (set: () => void) => {
  try {
    set();
  } catch {
    /* storage unavailable */
  }
};

/** A goal that was reached, with a key so its prompt shows only once. */
interface Crushed {
  key: string;
  what: string;
}

/** Running goal met by a run logged yesterday: the distance (whole run or one interval) at or under the target pace. */
function runCrushed(goals: Goals, workouts: Workout[], yesterday: string): Crushed | null {
  const g = goals.runGoal;
  if (!g) return null;
  const met = workouts.some((w) => {
    if (w.date !== yesterday || w.type !== 'Running' || !w.run) return false;
    const efforts = [{ km: w.run.distanceKm, pace: w.run.paceSecPerKm }, ...(w.run.segments ?? []).map((s) => ({ km: s.distanceKm, pace: s.timeSec / s.distanceKm }))];
    return efforts.some((e) => e.km >= g.distanceKm - 0.01 && (!g.paceSecPerKm || e.pace <= g.paceSecPerKm + 0.5));
  });
  return met ? { key: `run:${g.distanceKm}:${g.paceSecPerKm ?? ''}`, what: `${goalDistanceLabel(g.distanceKm)}${g.paceSecPerKm ? ` at ${fmtPace(g.paceSecPerKm)}/km` : ''}` } : null;
}

/** Weight goal reached: the current weight is at the target, coming from the weight when it was set. */
function weightCrushed(goals: Goals): Crushed | null {
  const { currentKg, targetKg, startKg } = goals.bodyWeight ?? {};
  if (currentKg === undefined || targetKg === undefined || startKg === undefined || startKg === targetKg) return null;
  const met = startKg > targetKg ? currentKg <= targetKg : currentKg >= targetKg;
  return met ? { key: `weight:${targetKg}`, what: `${targetKg} kg` } : null;
}

/**
 * After sign-in: celebrates a goal reached (a run yesterday that met the running goal,
 * or the weight target) and asks for the next one; otherwise, once per visit, asks
 * athletes without a weight or running goal to set them. ONZ opens the goals editor.
 */
export function GoalPrompt() {
  const { goals, workouts, today, readOnly, athlete, hasSampleData } = useData();
  const { openGoals } = useUI();
  const [closed, setClosed] = useState(false);
  const [crushedSeen, setCrushedSeen] = useState<string[]>(() => JSON.parse(read(() => localStorage.getItem(CRUSHED_KEY), '[]')) as string[]);
  const [asked] = useState(() => read(() => sessionStorage.getItem(askedKey(athlete.id)), '') === '1');
  if (readOnly || closed) return null;

  const crushed = [runCrushed(goals, workouts, addDays(today, -1)), weightCrushed(goals)].find((c) => c && !crushedSeen.includes(`${athlete.id}:${c.key}`)) ?? null;
  // The demo athlete has example goals and doesn't need asking.
  const missing = !hasSampleData && !asked && (!goals.bodyWeight?.targetKg || !goals.runGoal);
  if (!crushed && !missing) return null;

  const done = (onz: boolean) => {
    if (crushed) {
      const list = [...crushedSeen, `${athlete.id}:${crushed.key}`].slice(-100);
      setCrushedSeen(list);
      write(() => localStorage.setItem(CRUSHED_KEY, JSON.stringify(list)));
    }
    // Asked once per visit: a goal not set is asked about again next sign-in.
    write(() => sessionStorage.setItem(askedKey(athlete.id), '1'));
    setClosed(true);
    if (onz) openGoals();
  };

  return (
    <Modal
      open
      onClose={() => done(false)}
      title={crushed ? 'Goal crushed! 🏆🔥' : 'No goal? No glory! 🏆'}
      footer={
        <>
          <button className="btn-ghost" onClick={() => done(false)}>Cancel</button>
          <button className="btn-primary px-6" onClick={() => done(true)}>ONZ</button>
        </>
      }
    >
      {crushed ? (
        <div className="space-y-2 text-sm text-slate-700">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 font-medium text-emerald-800">You hit your goal: {crushed.what}.</p>
          <p>Look who’s unstoppable! 😎 Enjoy your victory lap, but don’t get too comfy. Set your next goal and level up! 🚀</p>
        </div>
      ) : (
        <div className="space-y-2 text-sm text-slate-700">
          <p>Even your GPS needs a destination. Set your goal, get moving, and make it happen! 🚀</p>
          <p className="text-xs text-slate-500">
            Not set yet: {[!goals.bodyWeight?.targetKg && 'body weight goal', !goals.runGoal && 'running goal'].filter(Boolean).join(' and ')}.
          </p>
        </div>
      )}
    </Modal>
  );
}
