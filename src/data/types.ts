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
  /** Working-set credit for muscle coverage when it differs from `sets` (HYROX sims). */
  creditSets?: number;
}

export interface RunData {
  kind: RunKind;
  distanceKm: number;
  /** Average pace in seconds per km. */
  paceSecPerKm: number;
  /** Average heart rate; optional for HYROX simulations. */
  avgHr?: number;
}

export interface StationResult {
  station: StationId;
  /** Completion time in seconds for the distance / reps actually performed. */
  timeSec: number;
  /** Share of the standard race distance performed (0.5 half sim, 0.75, 1 full). Defaults to 1. */
  fraction?: number;
}

export type Sex = 'female' | 'male';
export type WeightCategory = 'open' | 'pro';
export type RaceFormat = 'solo' | 'doubles' | 'relay';
export type SimType = 'half' | 'threeQuarter' | 'full';

export interface Division {
  sex: Sex;
  category: WeightCategory;
}

/** One 1 km run followed by one station in a logged HYROX simulation. */
export interface HyroxSplit {
  station: StationId;
  runSec?: number;
  stationSec?: number;
}

export interface HyroxSession {
  sim: SimType;
  division: Division;
  splits: HyroxSplit[];
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
  /** Race-style run + station splits for HYROX simulations. */
  hyrox?: HyroxSession;
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

export interface Race {
  id: string;
  name: string;
  date: string;
  format: RaceFormat;
  /** Ignored for relays, which always use open weights. */
  category: WeightCategory;
  /** Stations this athlete completes in a relay. */
  relayStations: StationId[];
}

export interface Goals {
  currentWeightKg: number;
  targetWeightKg: number;
  runGoalDistanceKm: number;
  runGoalPaceSecPerKm: number;
  weeklySessionsTarget: number;
  weeklyRunKmTarget: number;
  athleteSex: Sex;
  races: Race[];
}
