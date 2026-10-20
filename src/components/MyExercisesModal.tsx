import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { EXERCISE_BY_NAME } from '../data/exercises';
import { MUSCLE_BY_ID } from '../data/muscles';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { Modal } from './ui';

const MEASURE_LABEL = { weight: 'Reps & weight', time: 'Time', distanceTime: 'Distance + time' } as const;

/** The athlete's custom exercises: fix a name (everywhere it was used) or remove one from the list. */
export function MyExercisesModal({ onClose }: { onClose: () => void }) {
  const { customExercises, renameCustomExercise, deleteCustomExercise, workouts } = useData();
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
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-slate-500">Renaming fixes the name everywhere: logged workouts, open workouts and planned workouts.</p>
    </Modal>
  );
}
