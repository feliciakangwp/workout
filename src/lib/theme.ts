import type { WorkoutType } from '../data/types';

/** Categorical series slots (fixed order, validated for colour-vision deficiency). */
export const SERIES = {
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#eda100',
  magenta: '#e87ba4',
  green: '#008300',
  violet: '#6250d6',
  red: '#e34948',
};

export const TYPE_COLORS: Record<WorkoutType, string> = {
  F45: SERIES.blue,
  Strength: SERIES.orange,
  'HYROX Engine': SERIES.aqua,
  HYROX: SERIES.violet,
  Running: SERIES.magenta,
  Recovery: '#94a3b8',
};

export const TYPE_BADGE: Record<WorkoutType, string> = {
  F45: 'bg-blue-50 text-blue-700 ring-blue-200',
  Strength: 'bg-orange-50 text-orange-700 ring-orange-200',
  'HYROX Engine': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  HYROX: 'bg-violet-50 text-violet-700 ring-violet-200',
  Running: 'bg-pink-50 text-pink-700 ring-pink-200',
  Recovery: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/** Alphabetical, as offered in pickers. */
export const WORKOUT_TYPES: WorkoutType[] = ['F45', 'HYROX', 'HYROX Engine', 'Recovery', 'Running', 'Strength'];

export const TYPE_DESCRIPTIONS: Record<WorkoutType, string> = {
  F45: 'Functional HIIT class — full-body strength and conditioning.',
  HYROX: 'HYROX simulation or race-pace station work with compromised running.',
  'HYROX Engine': 'Erg intervals, sled work and wall balls with short run repeats.',
  Recovery: 'Tuina massage, mobility and light stretching.',
  Running: 'Easy, tempo, interval or long run.',
  Strength: 'Heavy compound lifts: squat, hinge, push, pull and carries.',
};

/** Shared Recharts styling. */
export const AXIS = {
  stroke: '#cbd5e1',
  tick: { fill: '#64748b', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;
export const GRID = { stroke: '#eef2f7', vertical: false } as const;
