import { Check, Pencil, Plus, Share2, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Profile } from '../data/types';
import { muscleList, useSharedWithMe } from './SharedExercises';
import { EXERCISE_BY_NAME } from '../data/exercises';
import { MUSCLE_BY_ID } from '../data/muscles';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { Modal } from './ui';

const MEASURE_LABEL = { weight: 'Reps & weight', time: 'Time', distanceTime: 'Distance + time' } as const;

/** The athlete's custom exercises: fix a name (everywhere it was used) or remove one from the list. */
export function MyExercisesModal({ onClose }: { onClose: () => void }) {
  const { customExercises, renameCustomExercise, deleteCustomExercise, shareCustomExercise, addSharedExercise, workouts } = useData();
  const { backend } = useAuth();
  const [friends, setFriends] = useState<Profile[]>([]);
  useEffect(() => {
    backend.listFriendships().then((l) => setFriends(l.filter((f) => f.status === 'friends').map((f) => f.profile))).catch(() => setFriends([]));
  }, [backend]);
  const { shared, loading } = useSharedWithMe();
  /** Exercise whose share list is open. */
  const [sharing, setSharing] = useState<string | null>(null);
  const nameOf = (id: string) => friends.find((f) => f.id === id)?.displayName ?? 'a friend';
  const { notify } = useUI();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const list = [...customExercises].sort((a, b) => a.name.localeCompare(b.name));
  const uses = (n: string) => workouts.filter((w) => w.exercises.some((e) => e.name === n)).length;

  const save = (from: string) => {
    const to = name.trim().replace(/\s+/g, ' ');
    if (!to) return setError('Enter a name.');
    if (to === from) return setEditing(null);
    if (EXERCISE_BY_NAME[to]) return setError(`"${to}" is already in the exercise list.`);
    if (customExercises.some((c) => c.name !== from && c.name.toLowerCase() === to.toLowerCase())) return setError(`You already have "${to}".`);
    renameCustomExercise(from, to);
    setEditing(null);
    notify(`Renamed to ${to} in all your workouts and plans.`);
  };

  return (
    <Modal open onClose={onClose} title="My exercises">
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">No custom exercises yet. Choose "Custom exercise…" when logging a workout and tick where to save it.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.map((c) => (
            <li key={c.name} className="py-3">
              {editing === c.name ? (
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      className="input"
                      aria-label={`New name for ${c.name}`}
                      value={name}
                      autoFocus
                      onChange={(e) => { setName(e.target.value); setError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && save(c.name)}
                    />
                    <button className="btn-primary shrink-0 px-2.5" onClick={() => save(c.name)} aria-label="Save name"><Check size={16} /></button>
                    <button className="btn-ghost shrink-0 px-2.5" onClick={() => setEditing(null)} aria-label="Cancel"><X size={16} /></button>
                  </div>
                  {error && <p className="mt-1 text-xs text-rose-700" role="alert">{error}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{c.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {MEASURE_LABEL[c.measure]} · {c.muscles.map((m) => MUSCLE_BY_ID[m].label).join(', ')} · in {c.types.join(', ')} · used in {uses(c.name)} workout{uses(c.name) === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button className={`rounded-lg p-2 hover:bg-slate-100 ${sharing === c.name || c.sharedWith?.length ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'}`} aria-label={`Share ${c.name}`} aria-expanded={sharing === c.name} onClick={() => setSharing(sharing === c.name ? null : c.name)}>
                    <Share2 size={16} />
                  </button>
                  <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Rename ${c.name}`} onClick={() => { setEditing(c.name); setName(c.name); setError(''); }}>
                    <Pencil size={16} />
                  </button>
                  <button
                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Delete ${c.name}`}
                    onClick={() => window.confirm(`Remove ${c.name} from your exercise list? Workouts already logged keep it.`) && deleteCustomExercise(c.name)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
              {(c.sharedWith?.length || c.sharedBy) && editing !== c.name ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  {c.sharedBy && <>From {c.sharedBy}. </>}
                  {c.sharedWith?.length ? <>Shared with {c.sharedWith.map(nameOf).join(', ')}.</> : null}
                </p>
              ) : null}
              {sharing === c.name && (
                <div className="mt-2 rounded-lg bg-blue-50 p-3">
                  <p className="mb-2 text-xs font-medium text-blue-900">Share {c.name} with:</p>
                  {friends.length ? (
                    <div className="space-y-1.5">
                      {friends.map((f) => {
                        const on = !!c.sharedWith?.includes(f.id);
                        return (
                          <label key={f.id} className="flex items-center gap-2 text-sm text-slate-800">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-blue-600"
                              checked={on}
                              onChange={(e) => shareCustomExercise(c.name, e.target.checked ? [...(c.sharedWith ?? []), f.id] : (c.sharedWith ?? []).filter((x) => x !== f.id))}
                            />
                            {f.displayName}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600">Add friends on the Friends page to share exercises with them.</p>
                  )}
                  <p className="mt-2 text-[11px] text-blue-800/80">Only the friends you tick get it, as a suggestion they can add to their own exercises.</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-slate-500">Renaming fixes the name everywhere: logged workouts, open workouts and planned workouts. Tap the share icon to share an exercise with chosen friends.</p>

      <section className="mt-5 border-t border-slate-100 pt-4">
        <h4 className="text-sm font-semibold text-slate-800">Shared with you</h4>
        {loading && !shared.length ? (
          <p className="mt-1 text-xs text-slate-500">Checking your friends' exercises…</p>
        ) : shared.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">Nothing new. When a friend shares a custom exercise with you, it appears here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {shared.map((x) => (
              <li key={`${x.from.id}:${x.exercise.name}`} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{x.exercise.name}</p>
                  <p className="truncate text-xs text-slate-500">From {x.from.displayName} · {MEASURE_LABEL[x.exercise.measure]} · {muscleList(x.exercise)} · in {x.exercise.types.join(', ')}</p>
                </div>
                <button className="btn-primary shrink-0 py-1.5 text-xs" onClick={() => addSharedExercise(x.exercise, x.from.displayName) && notify(`${x.exercise.name} added to your exercises.`)}>
                  <Plus size={14} /> Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}
