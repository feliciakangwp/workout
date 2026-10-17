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
  /** Reps per set (or metres for carries / sleds). Absent for time or distance + time exercises. */
  reps?: number;
  /** Distance per set in metres (ergs and bikes). */
  distanceM?: number;
  /** Time per set in seconds (plank, ergs and bikes). */
  durationSec?: number;
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
  /** Average heart rate; optional. */
  avgHr?: number;
  /** Individual runs or intervals that make up the total, when logged separately. */
  segments?: { distanceKm: number; timeSec: number }[];
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
  /** Finish details, entered once the race date has passed. */
  result?: RaceResult;
  /** Friends tagged as teammates (doubles partner or relay team). */
  teammates?: Profile[];
  /** Set when the race is shared with teammates: who created it (and manages teammates). */
  shared?: { ownerId: string; ownerName: string };
}

/** A doubles or relay race shared between teammates; every member can edit it. */
export interface SharedRace {
  id: string;
  ownerId: string;
  /** Everyone in the race, including the owner. */
  members: Profile[];
  race: { name: string; date: string; format: RaceFormat; category: WeightCategory; result?: RaceResult };
  /** Each member's own relay legs. */
  memberStations: Record<string, StationId[]>;
}

export interface RaceResult {
  /** Overall finish time; derived from splits + Roxzone when those are complete. */
  totalSec?: number;
  /** Total time spent in the Roxzone (transitions between runs and stations). */
  roxzoneSec?: number;
  splits: HyroxSplit[];
}

/** Workouts planned per date on the weekly calendar. */
export type WeekPlan = Record<string, WorkoutType[]>;

/** Editable Add Workout form values, kept while a workout is still open. */
export interface DraftForm {
  date: string;
  type: WorkoutType;
  title: string;
  duration: string;
  intensity: number;
  rows: {
    key: number;
    name: string;
    customName: string;
    customMuscles: MuscleGroup[];
    /** How a new custom exercise is counted. */
    customMeasure: ExerciseMeasure;
    /** Workout types a new custom exercise is saved to for future use. */
    saveTo: WorkoutType[];
    sets: string;
    reps: string;
    weight: string;
    distance: string;
    time: string;
  }[];
  runKind: RunKind;
  /** One row per run or interval. */
  runRows: { key: number; km: string; time: string }[];
  runHr: string;
  sim: SimType;
  division: Division;
  splits: Record<StationId, { run: string; station: string }>;
  simHr: string;
  notes: string;
}

export interface WorkoutDraft {
  id: string;
  /** ISO timestamp of the last save. */
  savedAt: string;
  form: DraftForm;
  /** Set when started from a planned workout (`date|type`). */
  fromPlan?: string;
}

/** Key for a planned workout's exercises: `2026-10-18|Strength`. */
export const planKey = (date: string, type: WorkoutType) => `${date}|${type}`;

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

/** sets × reps × weight, time only, or distance + time. */
export type ExerciseMeasure = 'weight' | 'time' | 'distanceTime';

/** A custom exercise the athlete saved for reuse in chosen workout types. */
export interface CustomExercise {
  name: string;
  measure: ExerciseMeasure;
  muscles: MuscleGroup[];
  types: WorkoutType[];
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export interface Profile {
  id: string;
  displayName: string;
}

export type FriendStatus = 'requested' | 'incoming' | 'friends';

export interface Friendship {
  profile: Profile;
  status: FriendStatus;
}

// ---------------------------------------------------------------------------
// Body composition (e.g. InBody segmental analysis)
// ---------------------------------------------------------------------------
export type BodySegment = 'leftArm' | 'rightArm' | 'trunk' | 'leftLeg' | 'rightLeg';

export interface SegmentReading {
  kg?: number;
  /** % of the ideal for height (as printed on the scan). */
  pct?: number;
  /** e.g. Under / Normal / Over. */
  evaluation?: string;
}

export interface WeighIn {
  id: string;
  date: string;
  weightKg?: number;
  skeletalMuscleKg?: number;
  bodyFatKg?: number;
  bodyFatPct?: number;
  /** Segmental lean (muscle) mass. */
  lean: Partial<Record<BodySegment, SegmentReading>>;
  /** Segmental fat mass. */
  fat: Partial<Record<BodySegment, SegmentReading>>;
  /** Compressed copy of the uploaded scan photo (data URL). */
  image?: string;
  notes?: string;
  /** Demonstration weigh-ins are generated, not uploaded. */
  isSample?: boolean;
}

/** Everything stored for one athlete. */
export interface UserData {
  version: 1;
  /** Seed for this athlete's demonstration workouts and wellness data. */
  sample: { seed: number; liftScale: number; paceShiftSec: number };
  added: Workout[];
  goals: Goals;
  plan: WeekPlan;
  /** Exercises planned ahead for a day's workout, keyed by planKey(). */
  planDetails?: Record<string, DraftForm>;
  drafts: WorkoutDraft[];
  customExercises: CustomExercise[];
  /** Body composition weigh-ins the athlete uploaded. */
  weighIns?: WeighIn[];
}
