import { Filter, ListChecks, Plus, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Card, DemoBadge, EmptyState, Modal, PageHeader, TypeBadge } from '../components/ui';
import { IntensityBar, WorkoutDetail } from '../components/WorkoutDetail';
import { useData } from '../context/DataContext';
import { DATA_START } from '../data/mockData';
import { MUSCLE_BY_ID } from '../data/muscles';
import type { WorkoutType } from '../data/types';
import { workoutMuscles } from '../lib/analytics';
import { fmtLong, fmtShort } from '../lib/dates';
import { fmtDuration } from '../lib/format';
import { WORKOUT_TYPES } from '../lib/theme';

const PAGE = 20;

export function WorkoutLog({ onAddWorkout }: { onAddWorkout: () => void }) {
  const { workouts, today, removeWorkout } = useData();
  const [type, setType] = useState<WorkoutType | 'all'>('all');
  const [from, setFrom] = useState(DATA_START);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workouts
      .filter((w) => (type === 'all' || w.type === type) && w.date >= from && w.date <= to)
      .filter((w) => !q || w.title.toLowerCase().includes(q) || w.exercises.some((e) => e.name.toLowerCase().includes(q)) || (w.notes ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.date === b.date ? (a.isSample ? 1 : -1) : a.date < b.date ? 1 : -1));
  }, [workouts, type, from, to, query]);

  const totalMin = filtered.reduce((a, w) => a + w.durationMin, 0);
  const open = workouts.find((w) => w.id === openId);
  const isFiltered = type !== 'all' || from !== DATA_START || to !== today || query !== '';
  const reset = () => {
    setType('all');
    setFrom(DATA_START);
    setTo(today);
    setQuery('');
  };
  const counts = WORKOUT_TYPES.map((t) => ({ t, n: workouts.filter((w) => w.type === t && w.date >= from && w.date <= to).length }));

  return (
    <div>
      <PageHeader title="Workout Log" subtitle={`${filtered.length} workouts · ${fmtDuration(totalMin)} total`} actions={<><DemoBadge /><button className="btn-primary" onClick={onAddWorkout}><Plus size={16} /> Add workout</button></>} />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
          <div>
            <label className="label" htmlFor="log-q">Search</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="log-q" className="input pl-9" placeholder="Title, exercise or notes" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="log-type">Workout type</label>
            <select id="log-type" className="input" value={type} onChange={(e) => { setType(e.target.value as WorkoutType | 'all'); setShown(PAGE); }}>
              <option value="all">All types</option>
              {WORKOUT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="log-from">From</label>
            <input id="log-from" type="date" className="input" value={from} min={DATA_START} max={to} onChange={(e) => { setFrom(e.target.value || DATA_START); setShown(PAGE); }} />
          </div>
          <div>
            <label className="label" htmlFor="log-to">To</label>
            <input id="log-to" type="date" className="input" value={to} min={from} max={today} onChange={(e) => { setTo(e.target.value || today); setShown(PAGE); }} />
          </div>
          <div className="flex items-end">
            <button className="btn-ghost w-full justify-center md:w-auto" onClick={reset} disabled={!isFiltered}><RotateCcw size={14} /> Reset</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Filter size={13} className="text-slate-400" />
          <button onClick={() => setType('all')} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${type === 'all' ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>All</button>
          {counts.map(({ t, n }) => (
            <button key={t} onClick={() => { setType(t); setShown(PAGE); }} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${type === t ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
              {t} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState title="No workouts match these filters" text="Try widening the date range or clearing the search." />
      ) : (
        <Card className="overflow-hidden">
          {/* Desktop table */}
          <table className="hidden w-full text-sm lg:table">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Workout</th>
                <th className="px-3 py-2.5 font-medium">Duration</th>
                <th className="px-3 py-2.5 font-medium">Exercises</th>
                <th className="px-3 py-2.5 font-medium">Intensity</th>
                <th className="px-5 py-2.5 font-medium">Muscle groups</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, shown).map((w) => {
                const muscles = workoutMuscles(w);
                return (
                  <tr key={w.id} onClick={() => setOpenId(w.id)} className="cursor-pointer align-top transition hover:bg-blue-50/50">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">{fmtLong(w.date)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <TypeBadge type={w.type} />
                        {!w.isSample && <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">NEW</span>}
                      </div>
                      <p className="mt-1 font-medium text-slate-800">{w.title}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">{fmtDuration(w.durationMin)}{w.run ? <span className="block text-xs text-slate-500">{w.run.distanceKm} km run</span> : null}</td>
                    <td className="max-w-[260px] px-3 py-3 text-slate-600">
                      {w.exercises.length ? (
                        <>
                          {w.exercises.slice(0, 3).map((e) => e.name).join(', ')}
                          {w.exercises.length > 3 && <span className="text-slate-400"> +{w.exercises.length - 3} more</span>}
                        </>
                      ) : (
                        <span className="text-slate-400">{w.run ? `${w.run.kind} run` : '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-3"><IntensityBar value={w.intensity} /></td>
                    <td className="px-5 py-3">
                      <div className="flex max-w-[240px] flex-wrap gap-1">
                        {muscles.slice(0, 4).map((m) => <span key={m} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{MUSCLE_BY_ID[m].label}</span>)}
                        {muscles.length > 4 && <span className="text-[11px] text-slate-400">+{muscles.length - 4}</span>}
                        {!muscles.length && <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile cards */}
          <ul className="divide-y divide-slate-100 lg:hidden">
            {filtered.slice(0, shown).map((w) => (
              <li key={w.id}>
                <button onClick={() => setOpenId(w.id)} className="w-full px-4 py-3 text-left hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <TypeBadge type={w.type} />
                      {!w.isSample && <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">NEW</span>}
                    </div>
                    <span className="text-xs text-slate-500">{fmtShort(w.date)}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-800">{w.title}</p>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{fmtDuration(w.durationMin)} · {w.exercises.length ? `${w.exercises.length} exercises` : w.run ? `${w.run.distanceKm} km` : 'recovery'}</span>
                    <IntensityBar value={w.intensity} />
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {shown < filtered.length && (
            <div className="border-t border-slate-100 p-3 text-center">
              <button className="btn-ghost" onClick={() => setShown((s) => s + PAGE)}><ListChecks size={14} /> Show more ({filtered.length - shown} remaining)</button>
            </div>
          )}
        </Card>
      )}

      <Modal open={!!open} onClose={() => setOpenId(null)} title="Workout details" wide>
        {open && <WorkoutDetail workout={open} onRemove={() => { removeWorkout(open.id); setOpenId(null); }} />}
      </Modal>
    </div>
  );
}
