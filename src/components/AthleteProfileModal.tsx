import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { STATIONS } from '../data/stations';
import type { Race, RaceFormat, Sex, WeightCategory } from '../data/types';
import { raceSummary, raceTypeLabel } from '../lib/analytics';
import { diffDays } from '../lib/dates';
import { Modal, Segmented } from './ui';

let raceKey = 0;
const newRace = (today: string): Race => ({ id: `race-new-${raceKey++}`, name: '', date: today, format: 'solo', category: 'open', relayStations: [] });

export function AthleteProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { goals, updateGoals, today } = useData();
  const [sex, setSex] = useState<Sex>(goals.athleteSex);
  const [races, setRaces] = useState<Race[]>(goals.races);
  const [errors, setErrors] = useState<string[]>([]);

  // Start from the saved profile each time the editor opens.
  useEffect(() => {
    if (!open) return;
    setSex(goals.athleteSex);
    setRaces(goals.races.map((r) => ({ ...r, relayStations: [...r.relayStations] })));
    setErrors([]);
  }, [open, goals]);

  const update = (id: string, patch: Partial<Race>) => setRaces((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const save = () => {
    const errs: string[] = [];
    races.forEach((r, i) => {
      const n = r.name.trim() || `Race ${i + 1}`;
      if (!r.name.trim()) errs.push(`Race ${i + 1}: enter a race name.`);
      if (!r.date) errs.push(`${n}: choose a date.`);
      if (r.format === 'relay' && r.relayStations.length === 0) errs.push(`${n}: pick at least one relay station.`);
    });
    setErrors(errs);
    if (errs.length) return;
    updateGoals({ ...goals, athleteSex: sex, races: races.map((r) => ({ ...r, name: r.name.trim() })) });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Athlete & upcoming races"
      wide
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save</button>
        </>
      }
    >
      {errors.length > 0 && (
        <ul className="mb-4 list-disc space-y-0.5 rounded-lg bg-rose-50 py-2 pl-7 pr-3 text-xs text-rose-700" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <section>
        <h4 className="text-sm font-semibold text-slate-800">Athlete</h4>
        <p className="mb-2 text-xs text-slate-500">Sets the race weights for every race below.</p>
        <Segmented size="md" value={sex} onChange={setSex} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-800">Upcoming races</h4>
          <button className="btn-ghost py-1.5 text-xs" onClick={() => setRaces((rs) => [...rs, newRace(today)])}>
            <Plus size={14} /> Add race
          </button>
        </div>
        {races.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No races yet — add one to see its demands and muscle focus.</p>}
        <div className="space-y-3">
          {races.map((r, i) => {
            const summary = raceSummary(r, sex);
            const days = diffDays(r.date, today);
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_170px_auto]">
                  <div>
                    <label className="label" htmlFor={`rn-${r.id}`}>Race name</label>
                    <input id={`rn-${r.id}`} className="input" placeholder={`e.g. HYROX Singapore`} value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`rd-${r.id}`}>Date</label>
                    <input id={`rd-${r.id}`} type="date" className="input" value={r.date} onChange={(e) => update(r.id, { date: e.target.value })} />
                  </div>
                  <div className="flex items-end">
                    <button className="btn-ghost w-full justify-center text-rose-600 hover:bg-rose-50 sm:w-auto" onClick={() => setRaces((rs) => rs.filter((x) => x.id !== r.id))} aria-label={`Remove race ${i + 1}`}>
                      <Trash2 size={15} /> <span className="sm:hidden">Remove race</span>
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
                  <div>
                    <p className="label">Format</p>
                    <Segmented<RaceFormat> size="md" value={r.format} onChange={(format) => update(r.id, { format })} options={[{ value: 'solo', label: 'Solo' }, { value: 'doubles', label: 'Doubles' }, { value: 'relay', label: 'Relay' }]} />
                  </div>
                  <div>
                    <p className="label">Weights</p>
                    {r.format === 'relay' ? (
                      <p className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600">Open (relay)</p>
                    ) : (
                      <Segmented<WeightCategory> size="md" value={r.category} onChange={(category) => update(r.id, { category })} options={[{ value: 'open', label: 'Open' }, { value: 'pro', label: 'Pro' }]} />
                    )}
                  </div>
                </div>

                {r.format === 'relay' && (
                  <div className="mt-3">
                    <p className="label">Your relay station(s)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {STATIONS.map((s) => {
                        const on = r.relayStations.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => update(r.id, { relayStations: on ? r.relayStations.filter((x) => x !== s.id) : [...r.relayStations, s.id] })}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}
                          >
                            {s.order}. {s.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">In a 4-person relay each athlete usually takes two run + station legs.</p>
                  </div>
                )}

                <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <b className="font-semibold">{raceTypeLabel(r, sex)}</b> · {summary.runKm} km running · {summary.stations} station{summary.stations === 1 ? '' : 's'}
                  {days >= 0 ? ` · ${days} days to go` : ' · past race'}
                  <span className="block text-blue-700/80">{summary.note}</span>
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </Modal>
  );
}
