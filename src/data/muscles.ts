import type { MuscleGroup } from './types';

export interface MuscleInfo {
  id: MuscleGroup;
  label: string;
  /** Target number of effective working sets per week. */
  weeklyTargetSets: number;
  view: 'front' | 'back' | 'both';
}

export const MUSCLES: MuscleInfo[] = [
  { id: 'quadriceps', label: 'Quadriceps', weeklyTargetSets: 16, view: 'front' },
  { id: 'hamstrings', label: 'Hamstrings', weeklyTargetSets: 14, view: 'back' },
  { id: 'glutes', label: 'Glutes', weeklyTargetSets: 16, view: 'back' },
  { id: 'calves', label: 'Calves', weeklyTargetSets: 10, view: 'both' },
  { id: 'chest', label: 'Chest', weeklyTargetSets: 12, view: 'front' },
  { id: 'back', label: 'Back', weeklyTargetSets: 16, view: 'back' },
  { id: 'shoulders', label: 'Shoulders', weeklyTargetSets: 12, view: 'both' },
  { id: 'biceps', label: 'Biceps', weeklyTargetSets: 8, view: 'front' },
  { id: 'triceps', label: 'Triceps', weeklyTargetSets: 8, view: 'back' },
  { id: 'core', label: 'Core', weeklyTargetSets: 12, view: 'front' },
];

export const MUSCLE_BY_ID = Object.fromEntries(MUSCLES.map((m) => [m.id, m])) as Record<
  MuscleGroup,
  MuscleInfo
>;
