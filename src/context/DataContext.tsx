import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEMO_TODAY, generateSample } from '../data/mockData';
import { localToday } from '../lib/dates';
import { plannedAsDone } from '../lib/planWorkouts';
import { mergeUserData } from '../lib/merge';
import { STATIONS } from '../data/stations';
import { OTHER_LEG, planKey, type CustomExercise, type DraftForm, type Goals, type Profile, type Race, type SharedRace, type UserData, type WeekPlan, type WeighIn, type Workout, type WorkoutDraft, type WorkoutType } from '../data/types';
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
  /** Replaces a logged workout with an edited version (same id). */
  updateWorkout: (id: string, w: Omit<Workout, 'id' | 'isSample'>) => void;
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
  /** Renames a custom exercise everywhere it is used: logged workouts, open workouts and plans. */
  renameCustomExercise: (from: string, to: string) => void;
  /** Removes a custom exercise from the exercise list (logged workouts keep it). */
  deleteCustomExercise: (name: string) => void;
  /** Body composition weigh-ins, oldest first (demonstration ones until the athlete adds their own). */
  weighIns: WeighIn[];
  addWeighIn: (w: Omit<WeighIn, 'id' | 'isSample'>) => void;
  removeWeighIn: (id: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

/** A shared race as seen by one member: their own relay legs, everyone else as teammates. */
function fromShared(s: SharedRace, viewerId: string): Race {
  // Who does each relay leg; legs of someone who left the race become unassigned.
  const ids = new Set([...s.members.map((m) => m.id), OTHER_LEG]);
  const legs = s.race.legs
    ? (Object.fromEntries(Object.entries(s.race.legs).filter(([, who]) => who && ids.has(who))) as Race['legs'])
    : (Object.fromEntries(Object.entries(s.memberStations).flatMap(([who, st]) => st.map((x) => [x, who]))) as Race['legs']);
  return {
    id: s.id,
    ...s.race,
    legs,
    relayStations: STATIONS.filter((st) => legs?.[st.id] === viewerId).map((st) => st.id),
    teammates: s.members.filter((m) => m.id !== viewerId),
    shared: { ownerId: s.ownerId, ownerName: s.members.find((m) => m.id === s.ownerId)?.displayName ?? 'Teammate' },
  };
}

/** JSON with sorted keys and no undefined values: the database returns keys in its own order. */
const stableJson = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => [k, x[k]])) : x));

/** Builds the shared record for a race edited by `me`; only the owner's edits change the members. */
function toShared(r: Race, me: Profile, existing?: SharedRace): SharedRace {
  const isOwner = !existing || existing.ownerId === me.id;
  const members = isOwner ? [me, ...(r.teammates ?? []).filter((t) => t.id !== me.id)] : existing.members;
  const ids = new Set(members.map((m) => m.id));
  // With assigned legs every member's stations follow from them; otherwise each member keeps their own picks.
  const memberStations = r.legs
    ? Object.fromEntries([...ids].map((id) => [id, STATIONS.filter((st) => r.legs?.[st.id] === id).map((st) => st.id)]))
    : Object.fromEntries(Object.entries({ ...existing?.memberStations, [me.id]: r.relayStations }).filter(([id]) => ids.has(id)));
  return {
    id: existing?.id ?? `sr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ownerId: existing?.ownerId ?? me.id,
    members,
    race: { name: r.name, date: r.date, kind: r.kind, distanceKm: r.distanceKm, redline: r.redline, format: r.format, category: r.category, result: r.result, legs: r.format === 'relay' ? r.legs : undefined },
    memberStations,
  };
}

/**
 * Races added in different visits could share an id (an old per-visit counter),
 * so editing one changed the other. Give repeats their own id; the fix is saved
 * with the next change.
 */
function repairRaceIds(d: UserData): UserData {
  const seen = new Set<string>();
  let changed = false;
  const races = d.goals.races.map((r, i) => {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      return r;
    }
    changed = true;
    const id = `${r.id}-${i}`;
    seen.add(id);
    return { ...r, id };
  });
  return changed ? { ...d, goals: { ...d.goals, races } } : d;
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
  // Teammates can tag you at any time: check again when the app comes back into view and every minute.
  useEffect(() => {
    loadShared();
    const onVisible = () => document.visibilityState === 'visible' && loadShared();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(loadShared, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [loadShared]);

  /** The version last loaded from or saved to the server. */
  const base = useRef<UserData | null>(null);
  /** The local data matching `base` (no unsaved edits while state is this object). */
  const synced = useRef<UserData | null>(null);
  /** Set when state is replaced from the server, so that change isn't saved back. */
  const skipSave = useRef(false);
  const pending = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let live = true;
    loaded.current = false;
    setData(null);
    setError(null);
    backend
      .loadUserData(athlete.id)
      .then((d) => {
        if (!live) return;
        base.current = d;
        if (d) {
          const repaired = repairRaceIds(d);
          synced.current = repaired === d ? d : null;
          setData(repaired);
        } else if (!readOnly) setData(newUserData(athlete.id));
        else setError(`${athlete.displayName} hasn't logged any data yet.`);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
    // Not keyed on the name: changing your user ID shouldn't reload your data.
  }, [backend, athlete.id, readOnly]);

  /**
   * Saves `local`. If another device saved since our last load / save, the two
   * are merged first, so a race or workout added elsewhere isn't overwritten.
   */
  const sync = useCallback(
    async (local: UserData) => {
      const server = await backend.loadUserData(athlete.id).catch(() => null);
      const b = base.current;
      const merged = server && b && (server.rev ?? 0) !== (b.rev ?? 0) ? mergeUserData(b, local, server) : local;
      const next = { ...merged, rev: Math.max(server?.rev ?? 0, b?.rev ?? 0) + 1 };
      await backend.saveUserData(athlete.id, next);
      base.current = next;
      if (merged === local) {
        synced.current = local;
        return;
      }
      // Show what the other device added, keeping any edit made while saving.
      setData((cur) => {
        if (cur !== local) return cur ? mergeUserData(local, cur, next) : cur;
        skipSave.current = true;
        synced.current = next;
        return next;
      });
    },
    [backend, athlete.id],
  );

  // Save own changes shortly after they happen.
  useEffect(() => {
    if (!data || readOnly) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (!loaded.current) {
      loaded.current = true;
      if (data === synced.current) return; // just loaded, nothing to save
    }
    if (data === synced.current) return;
    pending.current = true;
    const t = setTimeout(() => {
      queue.current = queue.current
        .then(() => sync(data))
        .catch((e: Error) => setError(`Couldn't save: ${e.message}`))
        .finally(() => (pending.current = false));
    }, 500);
    return () => clearTimeout(t);
  }, [data, readOnly, sync]);

  // Pick up changes saved on another device when the app comes back into view (and every minute).
  useEffect(() => {
    if (readOnly) return;
    const refresh = () => {
      if (pending.current) return;
      queue.current = queue.current.then(async () => {
        const server = await backend.loadUserData(athlete.id).catch(() => null);
        const b = base.current;
        if (!server || !b || (server.rev ?? 0) === (b.rev ?? 0)) return;
        base.current = server;
        setData((cur) => {
          if (!cur || cur === synced.current) {
            skipSave.current = true;
            synced.current = server;
            return server;
          }
          return mergeUserData(b, cur, server); // keep unsaved edits; saved by the next change
        });
      });
    };
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [readOnly, backend, athlete.id]);

  const update = useCallback((fn: (d: UserData) => UserData) => setData((d) => (d && !readOnly ? fn(d) : d)), [readOnly]);

  const addWorkout = useCallback(
    (w: Omit<Workout, 'id' | 'isSample'>) => {
      const workout: Workout = { ...w, id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, isSample: false };
      update((d) => ({ ...d, added: [...d.added, workout] }));
      return workout;
    },
    [update],
  );
  const updateWorkout = useCallback(
    (id: string, w: Omit<Workout, 'id' | 'isSample'>) => update((d) => ({ ...d, added: d.added.map((x) => (x.id === id ? { ...w, id, isSample: false } : x)) })),
    [update],
  );
  const removeWorkout = useCallback(
    (id: string) =>
      update((d) => {
        // A workout counted from the plan is removed by unplanning it.
        if (id.startsWith('plan:')) {
          const [date, type] = id.slice(5).split('|');
          return { ...d, plan: { ...d.plan, [date]: (d.plan[date] ?? []).filter((t) => t !== type) } };
        }
        return { ...d, added: d.added.filter((w) => w.id !== id) };
      }),
    [update],
  );
  /**
   * Saves goals and races. Doubles / relay races with tagged teammates are
   * stored as shared races; the rest stay in the athlete's own data.
   */
  const updateGoals = useCallback(
    (g: Goals) => {
      if (readOnly) return;
      const personal: Race[] = [];
      const nextShared: SharedRace[] = [];
      /** Races being shared for the first time, kept to fall back on if sharing fails. */
      const newlyShared = new Map<string, Race>();
      for (const r of g.races) {
        const existing = r.shared ? shared.find((x) => x.id === r.id) : undefined;
        const hasTeam = r.format !== 'solo' && (r.teammates?.length ?? 0) > 0;
        // A teammate's copy always stays shared; the owner's becomes personal again once untagged.
        if (hasTeam || (existing && existing.ownerId !== athlete.id)) {
          const sr = toShared(r, athlete, existing);
          nextShared.push(sr);
          if (!existing) newlyShared.set(sr.id, r);
        } else personal.push({ ...r, teammates: undefined, shared: undefined });
      }
      const ops: Promise<void>[] = [];
      for (const old of shared)
        if (!nextShared.some((x) => x.id === old.id)) ops.push(old.ownerId === athlete.id ? backend.deleteSharedRace(old.id) : backend.leaveSharedRace(old.id));
      // Only races that changed: re-saving the rest could overwrite a teammate's newer edit.
      const unchanged = (x: SharedRace) => {
        const old = shared.find((y) => y.id === x.id);
        return !!old && stableJson(old) === stableJson(x);
      };
      nextShared.filter((x) => !unchanged(x)).forEach((x) =>
        ops.push(
          backend.saveSharedRace(x).catch((e: Error) => {
            // Never lose a race because sharing it failed: keep it in your own races (tags kept, so it is shared on the next save).
            const r = newlyShared.get(x.id);
            if (r) update((d) => ({ ...d, goals: { ...d.goals, races: [...d.goals.races.filter((y) => y.id !== r.id), { ...r, shared: undefined }] } }));
            throw e;
          }),
        ),
      );
      setShared(nextShared);
      Promise.all(ops)
        .catch((e: Error) => setError(`Couldn't share a race with your teammates (it's kept in your races): ${e.message}`))
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
    // Weigh-ins are private: never shown on a friend's dashboard.
    if (!data || readOnly) return [];
    const own = data.weighIns ?? [];
    return sortWeighIns(own.length || !data.sample ? own : sampleWeighIns(data.sample.seed, data.goals.bodyWeight?.currentKg ?? 55, data.goals.athleteSex));
  }, [data, readOnly]);
  // The latest weigh-in is the current body weight.
  const latestWeight = [...weighIns].reverse().find((w) => w.weightKg !== undefined)?.weightKg;

  const renameCustomExercise = useCallback(
    (from: string, to: string) =>
      update((d) => {
        const ex = <T extends { name: string }>(e: T): T => (e.name === from ? { ...e, name: to } : e);
        const form = (f: DraftForm): DraftForm => ({ ...f, rows: f.rows.map(ex) });
        return {
          ...d,
          customExercises: d.customExercises.map(ex),
          added: d.added.map((w) => (w.exercises.some((e) => e.name === from) ? { ...w, exercises: w.exercises.map(ex) } : w)),
          drafts: d.drafts.map((x) => ({ ...x, form: form(x.form) })),
          planDetails: Object.fromEntries(Object.entries(d.planDetails ?? {}).map(([k, f]) => [k, form(f)])),
        };
      }),
    [update],
  );
  const deleteCustomExercise = useCallback((name: string) => update((d) => ({ ...d, customExercises: d.customExercises.filter((c) => c.name !== name) })), [update]);

  const sampleKey = data ? JSON.stringify(data.sample) : '';
  // Demonstration athletes get generated workouts; real accounts start with none.
  const sample = useMemo(() => (!sampleKey ? null : sampleKey === 'null' ? { workouts: [] } : generateSample(JSON.parse(sampleKey), today)), [sampleKey, today]);

  // Planned workouts on days that have come count as done even if not logged.
  const fromPlan = useMemo(
    () => (data && sample ? plannedAsDone(data.plan, data.planDetails ?? {}, [...sample.workouts, ...data.added], data.drafts, data.customExercises, today) : []),
    [data, sample, today],
  );

  const value = useMemo<DataContextValue | null>(
    () =>
      data && sample
        ? {
            athlete,
            readOnly,
            hasSampleData: !!data.sample,
            workouts: [...sample.workouts, ...data.added, ...fromPlan],
            goals: { ...data.goals, bodyWeight: latestWeight || data.goals.bodyWeight ? { ...data.goals.bodyWeight, currentKg: latestWeight ?? data.goals.bodyWeight?.currentKg } : undefined, races: [...data.goals.races, ...shared.map((x) => fromShared(x, athlete.id))] },
            today,
            addWorkout,
            removeWorkout,
            updateWorkout,
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
            renameCustomExercise,
            deleteCustomExercise,
            weighIns,
            addWeighIn,
            removeWeighIn,
          }
        : null,
    [data, sample, fromPlan, shared, today, athlete, readOnly, addWorkout, removeWorkout, updateWorkout, updateGoals, setDayPlan, setPlanDetail, saveDraft, deleteDraft, saveCustomExercises, renameCustomExercise, deleteCustomExercise, weighIns, latestWeight, addWeighIn, removeWeighIn],
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
