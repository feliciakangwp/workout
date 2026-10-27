import { MODE_MEASURE, defaultMode, exerciseMeasure } from '../data/exercises';
import { planKey, type CustomExercise, type DraftForm, type ExerciseEntry, type RunData, type WeekPlan, type Workout, type WorkoutDraft, type WorkoutType } from '../data/types';
import { DEFAULT_TITLE } from './workoutTitles';
import { parseTime } from './format';
import { F45_MINUTES, functionalF45 } from './f45';

const CUSTOM = '__custom__';
const num = (s: string) => {
  const n = Number(s);
  return s.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};
const secs = (s: string) => {
  const t = parseTime(s);
  return t > 0 ? t : undefined;
};

/** Typical length of a session when the plan doesn't give one. */
const DEFAULT_MINUTES: Record<WorkoutType, number> = { F45: F45_MINUTES, Strength: 60, HYROX: 75, 'HYROX Engine': 60, Running: 45, Recovery: 45 };

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
      const usual = r.name === CUSTOM ? r.customMeasure : saved?.measure ?? exerciseMeasure(name);
      // HYROX Engine: counted by reps, distance or time as chosen.
      const mode = form.type === 'HYROX Engine' ? r.mode ?? defaultMode(name, usual) : undefined;
      const measure = mode ? MODE_MEASURE[mode] : usual;
      const customMuscles = r.name === CUSTOM ? r.customMuscles : saved?.muscles;
      const weightKg = num(r.weight);
      if (measure === 'weight' && num(r.reps)) exercises.push({ name, sets, reps: num(r.reps), weightKg, durationSec: mode ? secs(r.time) : undefined, customMuscles, mode });
      else if (measure === 'time' && secs(r.time)) exercises.push({ name, sets, durationSec: secs(r.time), weightKg: mode && weightKg, customMuscles, mode });
      else if (measure === 'distanceTime' && num(r.distance)) exercises.push({ name, sets, distanceM: num(r.distance), durationSec: secs(r.time), weightKg: mode && weightKg, customMuscles, mode });
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
 * Planned workouts on earlier days that weren't logged count as done (today's
 * plan counts only once the workout is logged with Completed),
 * using any exercises written into the plan. A Recovery day stays a rest day
 * unless exercises were planned for it.
 */
export function plannedAsDone(plan: WeekPlan, details: Record<string, DraftForm>, logged: Workout[], drafts: WorkoutDraft[], customs: CustomExercise[], today: string): Workout[] {
  const out: Workout[] = [];
  for (const [date, types] of Object.entries(plan)) {
    // Today's plan only counts once logged (it may be trained later today); earlier days count anyway.
    if (date >= today) continue;
    for (const type of types) {
      const key = planKey(date, type);
      if (logged.some((w) => w.date === date && w.type === type)) continue;
      if (drafts.some((d) => d.fromPlan === key)) continue; // being logged right now
      const form = details[key];
      const planned = fromPlanForm(form, customs);
      const { run } = planned;
      if (type === 'Recovery' && !planned.exercises.length) continue; // rest day
      // F45 without planned exercises: a full-body functional class at 80% of best weights.
      const assumed = type === 'F45' && !planned.exercises.length;
      const exercises = assumed ? functionalF45(logged) : planned.exercises;
      // HYROX Engine without a duration: estimated from its timed exercises and runs, like the form does.
      const engineSec = type === 'HYROX Engine' ? exercises.reduce((a, e) => a + e.sets * (e.durationSec ?? 0), 0) + (run ? run.distanceKm * run.paceSecPerKm : 0) : 0;
      const minutes = num(form?.duration ?? '') ?? (run && type === 'Running' ? Math.ceil((run.distanceKm * run.paceSecPerKm) / 60) : engineSec ? Math.ceil(engineSec / 60) : DEFAULT_MINUTES[type]);
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
        assumedExercises: assumed || undefined,
      });
    }
  }
  return out;
}
