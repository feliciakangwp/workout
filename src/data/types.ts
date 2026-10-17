export type MuscleGroup =
  | 'quadriceps'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'core';

export type WorkoutType = 'F45' | 'Strength' | 'HYROX' | 'HYROX Engine' | 'Running' | 'Recovery';

export type StationId =
  | 'skierg'
  | 'sledPush'
  | 'sledPull'
  | 'burpeeBroadJump'
  | 'rowing'
  | 'farmersCarry'
  | 'sandbagLunges'
  | 'wallBalls';

export type RunKind = 'Easy' | 'Tempo' | 'Intervals' | '5K Time Trial' | 'Long' | 'Compromised';

export interface ExerciseEntry {
  name: string;
  sets: number;
  reps: number;
  /** Load per rep in kg (per hand for dumbbell / carry work). */
  weightKg?: number;
  /** Muscle groups for exercises not in the library (user-added). */
  customMuscles?: MuscleGroup[];
}

export interface RunData {
  kind: RunKind;
  distanceKm: number;
  /** Average pace in seconds per km. */
  paceSecPerKm: number;
  avgHr: number;
}

export interface StationResult {
  station: StationId;
  /** Completion time in seconds for the standard station distance / reps. */
  timeSec: number;
}

export interface Workout {
  id: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  type: WorkoutType;
  title: string;
  durationMin: number;
  /** Session RPE, 1–10. */
  intensity: number;
  exercises: ExerciseEntry[];
  run?: RunData;
  stations?: StationResult[];
  notes?: string;
  /** true for demonstration data, false for workouts added in this session. */
  isSample: boolean;
}

export interface RecoveryDay {
  date: string;
  sleepHours: number;
  sleepScore: number;
  restingHr: number;
  hrv: number;
  bodyBattery: number;
}

export interface Competition {
  name: string;
  date: string;
}

export interface Goals {
  currentWeightKg: number;
  targetWeightKg: number;
  runGoalDistanceKm: number;
  runGoalPaceSecPerKm: number;
  weeklySessionsTarget: number;
  weeklyRunKmTarget: number;
  competitions: Competition[];
}
