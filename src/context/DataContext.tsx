import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEMO_TODAY, generateSample } from '../data/mockData';
import { localToday } from '../lib/dates';
import { planKey, type CustomExercise, type DraftForm, type Goals, type Profile, type Race, type SharedRace, type UserData, type WeekPlan, type WeighIn, type Workout, type WorkoutDraft, type WorkoutType } from '../data/types';
import { newUserData } from '../lib/backend';
import { sampleWeighIns, sortWeighIns } from '../lib/analytics/body';
import { useAuth } from './AuthContext';

interface DataContextValue {
  /** Athlete whose data this is. */
  athlete: Profile;
  /** True when viewing a friend's dashboard: nothing can be changed. */
  readOnly: boolean;
  /** Demonstration athletes have generated sample workouts; real accounts don't. */
  hasSampleData: boolean;
  /** Demonstration workouts plus the athlete's logged workouts. */
  workouts: Workout[];
  goals: Goals;
  today: string;
  addWorkout: (w: Omit<Workout, 'id' | 'isSample'>) => Workout;
  removeWorkout: (id: string) => void;
  updateGoals: (g: Goals) => void;
  /** Planned workouts per date for the weekly calendar (starts empty). */
  plan: WeekPlan;
  setDayPlan: (date: string, types: WorkoutType[]) => void;
  /** Exercises planned ahead for a day's workout, keyed by planKey(). */
  planDetails: Record<string, DraftForm>;
  setPlanDetail: (key: string, form: DraftForm | null) => void;
  /** Workouts saved but not yet marked completed. */
  drafts: WorkoutDraft[];
  saveDraft: (d: WorkoutDraft) => void;
  deleteDraft: (id: string) => void;
  /** Custom exercises saved for reuse. */
  customExercises: CustomExercise[];
  saveCustomExercises: (list: CustomExercise[]) => void;
  /** Body composition weigh-ins, oldest first (demonstration ones until the athlete adds their own). */
  weighIns: WeighIn[];
  addWeighIn: (w: Omit<WeighIn, 'id' | 'isSample'>) => void;
  removeWeighIn: (id: string) => void;
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
  // Today's date on this device (never before the sample data's last day); refreshed when the app comes back into view.
  const [today, setToday] = useState(() => (localToday() > DEMO_TODAY ? localToday() : DEMO_TODAY));
  useEffect(() => {
    const refresh = () => setToday((t) => (localToday() > t ? localToday() : t));
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

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
    // Not keyed on the name: changing your user ID shouldn't reload your data.
  }, [backend, athlete.id, readOnly]);

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
  const setDayPlan = useCallback(
    (date: string, types: WorkoutType[]) =>
      update((d) => {
        // Unplanning a workout also drops the exercises planned for it.
        const details = Object.fromEntries(Object.entries(d.planDetails ?? {}).filter(([k]) => !k.startsWith(`${date}|`) || types.some((t) => k === planKey(date, t))));
        return { ...d, plan: { ...d.plan, [date]: types }, planDetails: details };
      }),
    [update],
  );
  const setPlanDetail = useCallback(
    (key: string, form: DraftForm | null) =>
      update((d) => {
        const details = { ...(d.planDetails ?? {}) };
        if (form) details[key] = form;
        else delete details[key];
        return { ...d, planDetails: details };
      }),
    [update],
  );
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

  const addWeighIn = useCallback(
    (w: Omit<WeighIn, 'id' | 'isSample'>) => update((d) => ({ ...d, weighIns: [...(d.weighIns ?? []), { ...w, id: `wi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }] })),
    [update],
  );
  const removeWeighIn = useCallback((id: string) => update((d) => ({ ...d, weighIns: (d.weighIns ?? []).filter((w) => w.id !== id) })), [update]);

  // Invented sample weigh-ins are shown only until the athlete uploads their own.
  const weighIns = useMemo(() => {
    if (!data) return [];
    const own = data.weighIns ?? [];
    return sortWeighIns(own.length || !data.sample ? own : sampleWeighIns(data.sample.seed, data.goals.currentWeightKg, data.goals.athleteSex));
  }, [data]);
  // The latest weigh-in is the current body weight.
  const latestWeight = [...weighIns].reverse().find((w) => w.weightKg !== undefined)?.weightKg;

  const sampleKey = data ? JSON.stringify(data.sample) : '';
  // Demonstration athletes get generated workouts; real accounts start with none.
  const sample = useMemo(() => (!sampleKey ? null : sampleKey === 'null' ? { workouts: [] } : generateSample(JSON.parse(sampleKey))), [sampleKey]);

  const value = useMemo<DataContextValue | null>(
    () =>
      data && sample
        ? {
            athlete,
            readOnly,
            hasSampleData: !!data.sample,
            workouts: [...sample.workouts, ...data.added],
            goals: { ...data.goals, currentWeightKg: latestWeight ?? data.goals.currentWeightKg, races: [...data.goals.races, ...shared.map((x) => fromShared(x, athlete.id))] },
            today,
            addWorkout,
            removeWorkout,
            updateGoals,
            plan: data.plan,
            setDayPlan,
            planDetails: data.planDetails ?? {},
            setPlanDetail,
            drafts: readOnly ? [] : data.drafts,
            saveDraft,
            deleteDraft,
            customExercises: data.customExercises,
            saveCustomExercises,
            weighIns,
            addWeighIn,
            removeWeighIn,
          }
        : null,
    [data, sample, shared, today, athlete, readOnly, addWorkout, removeWorkout, updateGoals, setDayPlan, setPlanDetail, saveDraft, deleteDraft, saveCustomExercises, weighIns, latestWeight, addWeighIn, removeWeighIn],
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

/** Whether demonstration labels apply (true outside a dashboard). */
export function useHasSampleData() {
  return useContext(DataContext)?.hasSampleData ?? true;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
