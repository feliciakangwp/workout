import { createContext, useContext, type ReactNode } from 'react';
import type { Workout, WorkoutType } from '../data/types';

interface UIContextValue {
  /** Opens a blank workout (on `date`, default today), or continues the open workout with this id. */
  openAddWorkout: (draftId?: string, date?: string) => void;
  /** Plan the exercises for a planned workout ahead of the day. */
  openPlanEditor: (date: string, type: WorkoutType) => void;
  /** Start today's planned workout, pre-filled with its planned exercises. */
  startPlannedWorkout: (date: string, type: WorkoutType) => void;
  /** Athlete & races: optionally with a new race ready to fill in, or scrolled to one race. */
  openProfile: (target?: ProfileTarget) => void;
  /** Edit a logged workout: fix its duration, add a forgotten set, and so on. */
  openEditWorkout: (w: Workout) => void;
  notify: (message: string) => void;
}

export type ProfileTarget = { addRace: 'upcoming' | 'past' } | { raceId: string };

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ value, children }: { value: UIContextValue; children: ReactNode }) {
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside UIProvider');
  return ctx;
}
