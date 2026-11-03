import { Dumbbell, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import type { CustomExercise, Profile } from '../data/types';
import { MUSCLE_BY_ID } from '../data/muscles';

export interface SharedExercise {
  from: Profile;
  exercise: CustomExercise;
}

const SEEN_KEY = 'hyrox-dashboard.seen-shared-exercises';
const readSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const seenKey = (me: string, s: SharedExercise) => `${me}:${s.from.id}:${s.exercise.name.toLowerCase()}`;

export const muscleList = (c: CustomExercise) => c.muscles.map((m) => MUSCLE_BY_ID[m].label).join(', ');

/**
 * Custom exercises friends have shared with you that you don't have yet (by name).
 * Read from each friend's data, which friends can already see.
 */
export function useSharedWithMe() {
  const { backend, user } = useAuth();
  const { customExercises, readOnly } = useData();
  const [all, setAll] = useState<SharedExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const me = user?.profile.id;
  const reload = useCallback(async () => {
    if (!me || readOnly) return;
    setLoading(true);
    try {
      const friends = (await backend.listFriendships()).filter((f) => f.status === 'friends').map((f) => f.profile);
      const lists = await Promise.all(
        friends.map((f) =>
          backend
            .loadUserData(f.id)
            .then((d) => (d?.customExercises ?? []).filter((c) => c.sharedWith?.includes(me)).map((exercise) => ({ from: f, exercise })))
            .catch(() => [] as SharedExercise[]),
        ),
      );
      setAll(lists.flat());
    } catch {
      setAll([]);
    } finally {
      setLoading(false);
    }
  }, [backend, me, readOnly]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const mine = new Set(customExercises.map((c) => c.name.toLowerCase()));
  return { shared: all.filter((s) => !mine.has(s.exercise.name.toLowerCase())), loading, reload };
}

/** Pops up once for each exercise a friend shares with you. */
export function SharedExercisePrompt() {
  const { user } = useAuth();
  const { readOnly, addSharedExercise } = useData();
  const { notify } = useUI();
  const { shared } = useSharedWithMe();
  const [seen, setSeen] = useState<string[]>(readSeen);
  if (readOnly || !user) return null;
  const me = user.profile.id;
  const next = shared.find((s) => !seen.includes(seenKey(me, s)));
  if (!next) return null;

  const dismiss = () => {
    const list = [...seen, seenKey(me, next)].slice(-300);
    setSeen(list);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(list));
    } catch {
      /* storage unavailable: hidden for this visit only */
    }
  };
  const add = () => {
    if (addSharedExercise(next.exercise, next.from.displayName)) notify(`${next.exercise.name} added to your exercises.`);
    dismiss();
  };

  return (
    <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl" role="dialog" aria-label="Shared exercise">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Dumbbell size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">New exercise from {next.from.displayName}</p>
          <p className="text-sm text-slate-600">
            <b className="font-semibold text-slate-900">{next.exercise.name}</b> · {muscleList(next.exercise)} · for {next.exercise.types.join(', ')}
          </p>
        </div>
        <button className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" onClick={dismiss} aria-label="Dismiss"><X size={16} /></button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn-ghost justify-center" onClick={dismiss}>Not now</button>
        <button className="btn-primary justify-center" onClick={add}>Add to my exercises</button>
      </div>
    </div>
  );
}
