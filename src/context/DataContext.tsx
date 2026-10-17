import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_GOALS, DEMO_TODAY, SAMPLE_RECOVERY, SAMPLE_WORKOUTS } from '../data/mockData';
import type { Goals, RecoveryDay, Workout } from '../data/types';

interface DataContextValue {
  /** Sample workouts plus any added during this session (in-memory only). */
  workouts: Workout[];
  recovery: RecoveryDay[];
  goals: Goals;
  today: string;
  addWorkout: (w: Omit<Workout, 'id' | 'isSample'>) => Workout;
  removeWorkout: (id: string) => void;
  updateGoals: (g: Goals) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [added, setAdded] = useState<Workout[]>([]);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);

  const addWorkout = useCallback((w: Omit<Workout, 'id' | 'isSample'>) => {
    const workout: Workout = { ...w, id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, isSample: false };
    setAdded((prev) => [...prev, workout]);
    return workout;
  }, []);
  const removeWorkout = useCallback((id: string) => setAdded((prev) => prev.filter((w) => w.id !== id)), []);

  const value = useMemo<DataContextValue>(
    () => ({
      workouts: [...SAMPLE_WORKOUTS, ...added],
      recovery: SAMPLE_RECOVERY,
      goals,
      today: DEMO_TODAY,
      addWorkout,
      removeWorkout,
      updateGoals: setGoals,
    }),
    [added, goals, addWorkout, removeWorkout],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
