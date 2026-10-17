import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEMO_TODAY, generateSample } from '../data/mockData';
import type { CustomExercise, Goals, Profile, RecoveryDay, UserData, WeekPlan, Workout, WorkoutDraft, WorkoutType } from '../data/types';
import { newUserData } from '../lib/backend';
import { useAuth } from './AuthContext';

interface DataContextValue {
  /** Athlete whose data this is. */
  athlete: Profile;
  /** True when viewing a friend's dashboard: nothing can be changed. */
  readOnly: boolean;
  /** Demonstration workouts plus the athlete's logged workouts. */
  workouts: Workout[];
  recovery: RecoveryDay[];
  goals: Goals;
  today: string;
  addWorkout: (w: Omit<Workout, 'id' | 'isSample'>) => Workout;
  removeWorkout: (id: string) => void;
  updateGoals: (g: Goals) => void;
  /** Planned workouts per date for the weekly calendar (starts empty). */
  plan: WeekPlan;
  setDayPlan: (date: string, types: WorkoutType[]) => void;
  /** Workouts saved but not yet marked completed. */
  drafts: WorkoutDraft[];
  saveDraft: (d: WorkoutDraft) => void;
  deleteDraft: (id: string) => void;
  /** Custom exercises saved for reuse. */
  customExercises: CustomExercise[];
  saveCustomExercises: (list: CustomExercise[]) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

/** Loads the viewed athlete's data and saves changes (own data only). */
export function DataProvider({ children }: { children: ReactNode }) {
  const { backend, user, viewing, viewFriend } = useAuth();
  const athlete = viewing!;
  const readOnly = athlete.id !== user?.profile.id;
  const [data, setData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    let live = true;
    loaded.current = false;
    setData(null);
    setError(null);
    backend
      .loadUserData(athlete.id)
      .then((d) => {
        if (!live) return;
        if (d) setData(d);
        else if (!readOnly) setData(newUserData(athlete.id));
        else setError(`${athlete.displayName} hasn't logged any data yet.`);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [backend, athlete.id, athlete.displayName, readOnly]);

  // Save own changes shortly after they happen.
  useEffect(() => {
    if (!data || readOnly) return;
    if (!loaded.current) {
      loaded.current = true;
      backend.saveUserData(athlete.id, data).catch(() => undefined); // persists new accounts' starting data
      return;
    }
    const t = setTimeout(() => backend.saveUserData(athlete.id, data).catch((e: Error) => setError(`Couldn't save: ${e.message}`)), 500);
    return () => clearTimeout(t);
  }, [data, readOnly, backend, athlete.id]);

  const update = useCallback((fn: (d: UserData) => UserData) => setData((d) => (d && !readOnly ? fn(d) : d)), [readOnly]);

  const addWorkout = useCallback(
    (w: Omit<Workout, 'id' | 'isSample'>) => {
      const workout: Workout = { ...w, id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, isSample: false };
      update((d) => ({ ...d, added: [...d.added, workout] }));
      return workout;
    },
    [update],
  );
  const removeWorkout = useCallback((id: string) => update((d) => ({ ...d, added: d.added.filter((w) => w.id !== id) })), [update]);
  const updateGoals = useCallback((g: Goals) => update((d) => ({ ...d, goals: g })), [update]);
  const setDayPlan = useCallback((date: string, types: WorkoutType[]) => update((d) => ({ ...d, plan: { ...d.plan, [date]: types } })), [update]);
  const saveDraft = useCallback(
    (draft: WorkoutDraft) => update((d) => ({ ...d, drafts: d.drafts.some((x) => x.id === draft.id) ? d.drafts.map((x) => (x.id === draft.id ? draft : x)) : [...d.drafts, draft] })),
    [update],
  );
  const deleteDraft = useCallback((id: string) => update((d) => ({ ...d, drafts: d.drafts.filter((x) => x.id !== id) })), [update]);
  const saveCustomExercises = useCallback(
    (list: CustomExercise[]) =>
      update((d) => {
        const byName = new Map(d.customExercises.map((c) => [c.name.toLowerCase(), c]));
        list.forEach((c) => {
          const prev = byName.get(c.name.toLowerCase());
          byName.set(c.name.toLowerCase(), prev ? { ...c, types: [...new Set([...prev.types, ...c.types])] } : c);
        });
        return { ...d, customExercises: [...byName.values()] };
      }),
    [update],
  );

  const sampleKey = data ? JSON.stringify(data.sample) : '';
  const sample = useMemo(() => (sampleKey ? generateSample(JSON.parse(sampleKey)) : null), [sampleKey]);

  const value = useMemo<DataContextValue | null>(
    () =>
      data && sample
        ? {
            athlete,
            readOnly,
            workouts: [...sample.workouts, ...data.added],
            recovery: sample.recovery,
            goals: data.goals,
            today: DEMO_TODAY,
            addWorkout,
            removeWorkout,
            updateGoals,
            plan: data.plan,
            setDayPlan,
            drafts: readOnly ? [] : data.drafts,
            saveDraft,
            deleteDraft,
            customExercises: data.customExercises,
            saveCustomExercises,
          }
        : null,
    [data, sample, athlete, readOnly, addWorkout, removeWorkout, updateGoals, setDayPlan, saveDraft, deleteDraft, saveCustomExercises],
  );

  if (!value)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center text-sm text-slate-500">
        <p>{error ?? `Loading ${athlete.displayName}'s dashboard…`}</p>
        {readOnly && error && (
          <button className="btn-primary" onClick={() => viewFriend(null)}>
            Back to my dashboard
          </button>
        )}
      </div>
    );
  return (
    <DataContext.Provider value={value}>
      {error && <div className="bg-rose-50 px-4 py-2 text-center text-xs text-rose-700">{error}</div>}
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
