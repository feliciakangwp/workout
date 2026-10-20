import { exerciseMeasure } from '../data/exercises';
import { planKey, type CustomExercise, type DraftForm, type ExerciseEntry, type RunData, type WeekPlan, type Workout, type WorkoutDraft, type WorkoutType } from '../data/types';
import { DEFAULT_TITLE } from './workoutTitles';
import { parseTime } from './format';

const CUSTOM = '__custom__';
const num = (s: string) => {
  const n = Number(s);
  return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};
const secs = (s: string) => {
  const t = parseTime(s.trim().replace(/\./g, ':'));
  return t > 0 ? t : undefined;
};

/** Typical length of a session when the plan doesn't give one. */
const DEFAULT_MINUTES: Record<WorkoutType, number> = { F45: 50, Strength: 60, HYROX: 75, 'HYROX Engine': 60, Running: 45, Recovery: 45 };

/** The exercises and runs written into a plan, as a workout would record them. */
function fromPlanForm(form: DraftForm | undefined, customs: CustomExercise[]): { exercises: ExerciseEntry[]; run?: RunData } {
  if (!form) return { exercises: [] };
  const exercises: ExerciseEntry[] = [];
  if (form.type !== 'Running' && form.type !== 'HYROX')
    for (const r of form.rows) {
      const name = r.name === CUSTOM ? r.customName.trim() : r.name;
      const sets = num(r.sets);
      if (!name || !sets) continue;
      const saved = customs.find((c) => c.name === name);
      const measure = r.name === CUSTOM ? r.customMeasure : saved?.measure ?? exerciseMeasure(name);
      const customMuscles = r.name === CUSTOM ? r.customMuscles : saved?.muscles;
      if (measure === 'weight' && num(r.reps)) exercises.push({ name, sets, reps: num(r.reps), weightKg: num(r.weight), customMuscles });
      else if (measure === 'time' && secs(r.time)) exercises.push({ name, sets, durationSec: secs(r.time), customMuscles });
      else if (measure === 'distanceTime' && num(r.distance)) exercises.push({ name, sets, distanceM: num(r.distance), durationSec: secs(r.time), customMuscles });
    }
  const segments = form.runRows.flatMap((r) => {
    const km = num(r.km);
    const t = secs(r.time);
    return km && t ? [{ distanceKm: km, timeSec: t }] : [];
  });
  if (!segments.length || (form.type !== 'Running' && form.type !== 'HYROX Engine')) return { exercises };
  const km = segments.reduce((a, x) => a + x.distanceKm, 0);
  const sec = segments.reduce((a, x) => a + x.timeSec, 0);
  return {
    exercises,
    run: { kind: form.type === 'Running' ? form.runKind : 'Intervals', distanceKm: Math.round(km * 100) / 100, paceSecPerKm: Math.round(sec / km), segments },
  };
}

/**
 * Planned workouts on today or earlier days that weren't logged count as done,
 * using any exercises written into the plan. A Recovery day stays a rest day
 * unless exercises were planned for it.
 */
export function plannedAsDone(plan: WeekPlan, details: Record<string, DraftForm>, logged: Workout[], drafts: WorkoutDraft[], customs: CustomExercise[], today: string): Workout[] {
  const out: Workout[] = [];
  for (const [date, types] of Object.entries(plan)) {
    if (date > today) continue;
    for (const type of types) {
      const key = planKey(date, type);
      if (logged.some((w) => w.date === date && w.type === type)) continue;
      if (drafts.some((d) => d.fromPlan === key)) continue; // being logged right now
      const form = details[key];
      const { exercises, run } = fromPlanForm(form, customs);
      if (type === 'Recovery' && !exercises.length) continue; // rest day
      const minutes = num(form?.duration ?? '') ?? (run && type === 'Running' ? Math.ceil((run.distanceKm * run.paceSecPerKm) / 60) : DEFAULT_MINUTES[type]);
      out.push({
        id: `plan:${key}`,
        date,
        type,
        title: form?.title?.trim() || DEFAULT_TITLE[type],
        durationMin: minutes,
        intensity: form?.intensity ?? 6,
        exercises,
        run,
        notes: form?.notes?.trim() || undefined,
        isSample: false,
        fromPlan: true,
      });
    }
  }
  return out;
}
