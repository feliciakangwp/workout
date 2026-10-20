import type { WorkoutType } from '../data/types';

/** Title used when a workout is saved without one. */
export const DEFAULT_TITLE: Record<WorkoutType, string> = {
  F45: 'F45 Class',
  Strength: 'Strength Session',
  HYROX: 'HYROX Session',
  'HYROX Engine': 'HYROX Engine',
  Running: 'Run',
  Recovery: 'Rest and recovery',
};
