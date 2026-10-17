import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEMO_TODAY, generateSample } from '../data/mockData';
import type { CustomExercise, Goals, Profile, Race, RecoveryDay, SharedRace, UserData, WeekPlan, Workout, WorkoutDraft, WorkoutType } from '../data/types';
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

/** A shared race as seen by one member: their own relay legs, everyone else as teammates. */
function fromShared(s: SharedRace, viewerId: string): Race {
  return {
    id: s.id,
    ...s.race,
    relayStations: s.memberStations[viewerId] ?? [],
    teammates: s.members.filter((m) => m.id !== viewerId),
    shared: { ownerId: s.ownerId, ownerName: s.members.find((m) => m.id === s.ownerId)?.displayName ?? 'Teammate' },
  };
}

/** Builds the shared record for a race edited by `me`; only the owner's edits change the members. */
function toShared(r: Race, me: Profile, existing?: SharedRace): SharedRace {
  const isOwner = !existing || existing.ownerId === me.id;
  const members = isOwner ? [me, ...(r.teammates ?? []).filter((t) => t.id !== me.id)] : existing.members;
  const ids = new Set(members.map((m) => m.id));
  const memberStations = Object.fromEntries(Object.entries({ ...existing?.memberStations, [me.id]: r.relayStations }).filter(([id]) => ids.has(id)));
  return {
    id: existing?.id ?? `sr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ownerId: existing?.ownerId ?? me.id,
    members,
    race: { name: r.name, date: r.date, format: r.format, category: r.category, result: r.result },
    memberStations,
  };
}

/** Loads the viewed athlete's data and saves changes (own data only). */
export function DataProvider({ children }: { children: ReactNode }) {
  const { backend, user, viewing, viewFriend } = useAuth();
  const athlete = viewing!;
  const readOnly = athlete.id !== user?.profile.id;
  const [data, setData] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<SharedRace[]>([]);
  const loaded = useRef(false);

  // Shared doubles / relay races this athlete is in (only ones you are also in when viewing a friend).
  const loadShared = useCallback(
    () =>
      backend
        .listSharedRaces()
        .then((list) => setShared(list.filter((r) => r.members.some((m) => m.id === athlete.id))))
        .catch(() => setShared([])),
    [backend, athlete.id],
  );
  useEffect(() => {
    loadShared();
  }, [loadShared]);

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
  /**
   * Saves goals and races. Doubles / relay races with tagged teammates are
   * stored as shared races; the rest stay in the athlete's own data.
   */
  const updateGoals = useCallback(
    (g: Goals) => {
      if (readOnly) return;
      const personal: Race[] = [];
      const nextShared: SharedRace[] = [];
      for (const r of g.races) {
        const existing = r.shared ? shared.find((x) => x.id === r.id) : undefined;
        const hasTeam = r.format !== 'solo' && (r.teammates?.length ?? 0) > 0;
        // A teammate's copy always stays shared; the owner's becomes personal again once untagged.
        if (hasTeam || (existing && existing.ownerId !== athlete.id)) nextShared.push(toShared(r, athlete, existing));
        else personal.push({ ...r, teammates: undefined, shared: undefined });
      }
      const ops: Promise<void>[] = [];
      for (const old of shared)
        if (!nextShared.some((x) => x.id === old.id)) ops.push(old.ownerId === athlete.id ? backend.deleteSharedRace(old.id) : backend.leaveSharedRace(old.id));
      nextShared.forEach((x) => ops.push(backend.saveSharedRace(x)));
      setShared(nextShared);
      Promise.all(ops)
        .catch((e: Error) => setError(`Couldn't update shared race: ${e.message}`))
        .finally(loadShared);
      update((d) => ({ ...d, goals: { ...g, races: personal } }));
    },
    [update, readOnly, shared, athlete, backend, loadShared],
  );
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
            goals: { ...data.goals, races: [...data.goals.races, ...shared.map((x) => fromShared(x, athlete.id))] },
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
    [data, sample, shared, athlete, readOnly, addWorkout, removeWorkout, updateGoals, setDayPlan, saveDraft, deleteDraft, saveCustomExercises],
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
