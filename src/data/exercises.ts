import type { ExerciseEntry, ExerciseMeasure, MuscleGroup } from './types';

export interface ExerciseInfo {
  name: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  /** Tracked lifts appear on the Strength Progression page. */
  tracked?: boolean;
  /** What the "reps" field measures for this exercise. Defaults to reps. */
  repUnit?: 'reps' | 'm';
  /** Conditioning efforts count as half a working set for muscle coverage. */
  conditioning?: boolean;
  /** How the exercise is logged: sets × reps × weight (default), time only, or distance + time. */
  measure?: ExerciseMeasure;
}

export const exerciseMeasure = (name: string): ExerciseMeasure => EXERCISE_BY_NAME[name]?.measure ?? 'weight';

/** Measure of a logged entry; custom exercises are inferred from the fields recorded. */
export const entryMeasure = (e: ExerciseEntry): ExerciseMeasure =>
  EXERCISE_BY_NAME[e.name]?.measure ?? (e.distanceM ? 'distanceTime' : e.durationSec && !e.reps ? 'time' : 'weight');

/**
 * Exercise → muscle mapping. A primary muscle receives 1 set of credit per set
 * performed; a secondary muscle receives 0.5. Conditioning efforts are halved.
 */
export const EXERCISES: ExerciseInfo[] = [
  // Tracked strength lifts
  { name: 'Romanian Deadlift', primary: ['hamstrings', 'glutes'], secondary: ['back', 'core'], tracked: true },
  { name: 'Squat', primary: ['quadriceps', 'glutes'], secondary: ['core', 'hamstrings'], tracked: true },
  { name: 'Lat Pulldown', primary: ['back'], secondary: ['biceps'], tracked: true },
  { name: 'Chest Press', primary: ['chest'], secondary: ['triceps', 'shoulders'], tracked: true },
  { name: 'Bulgarian Split Squat', primary: ['quadriceps', 'glutes'], secondary: ['hamstrings'], tracked: true },
  { name: 'Shoulder Press', primary: ['shoulders'], secondary: ['triceps'], tracked: true },
  { name: "Farmer's Carry", primary: ['core'], secondary: ['back', 'shoulders'], tracked: true, repUnit: 'm' },
  // Accessory / functional
  { name: 'Seated Cable Row', primary: ['back'], secondary: ['biceps'] },
  { name: 'Hip Thrust', primary: ['glutes'], secondary: ['hamstrings'] },
  { name: 'Walking Lunges', primary: ['quadriceps', 'glutes'], secondary: [] },
  { name: 'Goblet Squat', primary: ['quadriceps'], secondary: ['glutes', 'core'] },
  { name: 'Kettlebell Swing', primary: ['glutes', 'hamstrings'], secondary: ['core', 'back'], conditioning: true },
  { name: 'Push-up', primary: ['chest'], secondary: ['triceps', 'shoulders'] },
  { name: 'Bent-over Row', primary: ['back'], secondary: ['biceps'] },
  { name: 'Bicep Curl', primary: ['biceps'], secondary: [] },
  { name: 'Tricep Dip', primary: ['triceps'], secondary: ['chest'] },
  { name: 'Calf Raise', primary: ['calves'], secondary: [] },
  { name: 'Plank', primary: ['core'], secondary: [], measure: 'time' },
  { name: 'Russian Twist', primary: ['core'], secondary: [] },
  { name: 'Box Jump', primary: ['quadriceps'], secondary: ['glutes', 'calves'], conditioning: true },
  { name: 'Thruster', primary: ['quadriceps', 'shoulders'], secondary: ['glutes', 'triceps'], conditioning: true },
  { name: 'Renegade Row', primary: ['back', 'core'], secondary: ['biceps'] },
  { name: 'Burpee', primary: ['chest', 'quadriceps'], secondary: ['core', 'shoulders'], conditioning: true },
  // HYROX-specific work (sets = rounds/efforts)
  // Cardio machines: logged by distance and time
  { name: 'SkiErg', primary: ['back', 'triceps'], secondary: ['core', 'shoulders'], conditioning: true, measure: 'distanceTime' },
  { name: 'Row Erg', primary: ['back', 'quadriceps'], secondary: ['biceps', 'hamstrings'], conditioning: true, measure: 'distanceTime' },
  { name: 'Assault Bike', primary: ['quadriceps', 'glutes'], secondary: ['shoulders', 'back', 'hamstrings'], conditioning: true, measure: 'distanceTime' },
  { name: 'Bike Erg', primary: ['quadriceps'], secondary: ['glutes', 'hamstrings', 'calves'], conditioning: true, measure: 'distanceTime' },
  // HYROX stations
  { name: 'Sled Push', primary: ['quadriceps', 'calves'], secondary: ['glutes', 'shoulders'], repUnit: 'm', conditioning: true },
  { name: 'Sled Pull', primary: ['back', 'hamstrings'], secondary: ['biceps', 'glutes'], repUnit: 'm', conditioning: true },
  { name: 'Burpee Broad Jump', primary: ['quadriceps', 'chest'], secondary: ['glutes', 'calves'], repUnit: 'm', conditioning: true },
  { name: "Farmer's Carry (HYROX)", primary: ['core'], secondary: ['back', 'shoulders'], repUnit: 'm', conditioning: true },
  { name: 'Sandbag Lunges', primary: ['quadriceps', 'glutes'], secondary: ['core'], repUnit: 'm', conditioning: true },
  { name: 'Wall Balls', primary: ['quadriceps', 'shoulders'], secondary: ['glutes', 'triceps'], conditioning: true },
];

export const EXERCISE_BY_NAME: Record<string, ExerciseInfo> = Object.fromEntries(
  EXERCISES.map((e) => [e.name, e]),
);

export const TRACKED_LIFTS = EXERCISES.filter((e) => e.tracked).map((e) => e.name);
