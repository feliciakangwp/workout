import type { ExerciseEntry, Workout } from '../data/types';

/**
 * Typical F45 functional moves covering every muscle group, with a starting
 * load (kg) used when the athlete has no logged best for that move.
 */
const FUNCTIONAL: { name: string; sets: number; reps: number; startKg?: number }[] = [
  { name: 'Thruster', sets: 3, reps: 12, startKg: 8 },
  { name: 'Kettlebell Swing', sets: 3, reps: 15, startKg: 12 },
  { name: 'Walking Lunges', sets: 3, reps: 12, startKg: 6 },
  { name: 'Bent-over Row', sets: 3, reps: 12, startKg: 8 },
  { name: 'Push-up', sets: 3, reps: 12 },
  { name: 'Tricep Dip', sets: 3, reps: 12 },
  { name: 'Bicep Curl', sets: 3, reps: 12, startKg: 6 },
  { name: 'Calf Raise', sets: 3, reps: 15, startKg: 10 },
  { name: 'Russian Twist', sets: 3, reps: 20, startKg: 5 },
];

/** Length of an F45 class when none is given. */
export const F45_MINUTES = 45;

/**
 * An F45 session logged or planned without exercises is taken as a full-body
 * functional workout: every muscle group, at 80% of the athlete's best weight
 * for each move (or a typical starting weight if never logged).
 */
export function functionalF45(history: Workout[]): ExerciseEntry[] {
  const best = new Map<string, number>();
  for (const w of history) {
    if (w.assumedExercises) continue; // never base the estimate on an earlier estimate
    for (const e of w.exercises) if (e.weightKg && e.weightKg > (best.get(e.name) ?? 0)) best.set(e.name, e.weightKg);
  }
  return FUNCTIONAL.map(({ name, sets, reps, startKg }) => {
    const b = best.get(name);
    const weightKg = b ? Math.round(b * 0.8 * 2) / 2 : startKg;
    return { name, sets, reps, weightKg };
  });
}
