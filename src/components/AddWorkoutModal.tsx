import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EXERCISES, EXERCISE_BY_NAME } from '../data/exercises';
import { DATA_START } from '../data/mockData';
import { MUSCLES } from '../data/muscles';
import { SIM_TYPES, STATIONS, divisionLabel, simFraction, simLabel, stationSpec, stationWeight } from '../data/stations';
import type { Division, ExerciseEntry, HyroxSplit, MuscleGroup, RunKind, SimType, StationId, StationResult, Workout, WorkoutType } from '../data/types';
import { useData } from '../context/DataContext';
import { raceDivision, upcomingRaces } from '../lib/analytics';
import { fmtTime, parseTime } from '../lib/format';
import { WORKOUT_TYPES } from '../lib/theme';
import { Modal, Segmented } from './ui';

interface ExerciseRow {
  key: number;
  name: string;
  customName: string;
  customMuscles: MuscleGroup[];
  sets: string;
  reps: string;
  weight: string;
}

const CUSTOM = '__custom__';
const RUN_KINDS: RunKind[] = ['Easy', 'Tempo', 'Intervals', '5K Time Trial', 'Long', 'Compromised'];
const hasRun = (t: WorkoutType) => t === 'Running' || t === 'HYROX Engine';
/** Accepts "4:30" or "4.30" (easier on a phone number pad). */
const parseSplit = (text: string) => parseTime(text.replace('.', ':'));

type SplitInputs = Record<StationId, { run: string; station: string }>;
const emptySplits = () => Object.fromEntries(STATIONS.map((s) => [s.id, { run: '', station: '' }])) as SplitInputs;

let rowKey = 0;
const newRow = (): ExerciseRow => ({ key: rowKey++, name: 'Squat', customName: '', customMuscles: [], sets: '3', reps: '10', weight: '' });

const DEFAULT_TITLE: Record<WorkoutType, string> = {
  F45: 'F45 Class',
  Strength: 'Strength Session',
  HYROX: 'HYROX Session',
  'HYROX Engine': 'HYROX Engine',
  Running: 'Run',
  Recovery: 'Recovery Session',
};

export function AddWorkoutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addWorkout, today, goals } = useData();
  const nextRace = upcomingRaces(goals, today)[0];
  const defaultDivision: Division = nextRace ? raceDivision(nextRace, goals.athleteSex) : { sex: goals.athleteSex, category: 'open' };
  const [date, setDate] = useState(today);
  const [type, setType] = useState<WorkoutType>('Strength');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('60');
  const [intensity, setIntensity] = useState(7);
  const [rows, setRows] = useState<ExerciseRow[]>([newRow()]);
  const [runKind, setRunKind] = useState<RunKind>('Easy');
  const [runKm, setRunKm] = useState('');
  const [runTime, setRunTime] = useState('');
  const [runHr, setRunHr] = useState('');
  const [sim, setSim] = useState<SimType>('full');
  const [division, setDivision] = useState<Division>(defaultDivision);
  const [splits, setSplits] = useState<SplitInputs>(emptySplits);
  const [simHr, setSimHr] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const reset = () => {
    setDate(today);
    setType('Strength');
    setTitle('');
    setDuration('60');
    setIntensity(7);
    setRows([newRow()]);
    setRunKind('Easy');
    setRunKm('');
    setRunTime('');
    setRunHr('');
    setSim('full');
    setDivision(defaultDivision);
    setSplits(emptySplits());
    setSimHr('');
    setNotes('');
    setErrors([]);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const updateRow = (key: number, patch: Partial<ExerciseRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const pace = useMemo(() => {
    const km = Number(runKm);
    const t = parseTime(runTime);
    return km > 0 && t > 0 ? t / km : NaN;
  }, [runKm, runTime]);

  const simTotals = useMemo(() => {
    let run = 0;
    let station = 0;
    for (const s of STATIONS) {
      const r = parseSplit(splits[s.id].run);
      const st = parseSplit(splits[s.id].station);
      if (r > 0) run += r;
      if (st > 0) station += st;
    }
    return { run, station, total: run + station };
  }, [splits]);

  const chooseType = (t: WorkoutType) => {
    setType(t);
    if (t === 'HYROX') {
      setDivision(defaultDivision);
      setDuration(''); // derived from the sim's total time unless entered
    } else if (!duration) setDuration('60');
  };

  const submit = () => (type === 'HYROX' ? submitHyrox() : submitGeneral());

  const checkDate = (errs: string[]) => {
    if (!date) errs.push('Choose a workout date.');
    else if (date > today) errs.push('The prototype only accepts dates up to the demo date.');
    else if (date < DATA_START) errs.push('Choose a date within the demonstration period (from 20 Jul 2026).');
  };

  const finish = (w: Omit<Workout, 'id' | 'isSample'>) => {
    addWorkout(w);
    setToast(`${w.title} added — dashboards updated.`);
    reset();
    onClose();
  };

  const submitHyrox = () => {
    const errs: string[] = [];
    checkDate(errs);
    const fraction = simFraction(sim);
    const hyroxSplits: HyroxSplit[] = [];
    const stations: StationResult[] = [];
    const exercises: ExerciseEntry[] = [];
    const runTimes: number[] = [];
    for (const s of STATIONS) {
      const inputs = splits[s.id];
      const runSec = inputs.run.trim() ? parseSplit(inputs.run) : undefined;
      const stationSec = inputs.station.trim() ? parseSplit(inputs.station) : undefined;
      if (runSec !== undefined && !(runSec >= 150 && runSec <= 900)) errs.push(`Run before ${s.name}: enter a 1 km time as m:ss (e.g. 5:20).`);
      if (stationSec !== undefined && !(stationSec >= 10 && stationSec <= 1800)) errs.push(`${s.name}: enter a time as m:ss (e.g. 4:45).`);
      hyroxSplits.push({ station: s.id, runSec, stationSec });
      if (runSec) runTimes.push(runSec);
      if (stationSec) {
        stations.push({ station: s.id, timeSec: stationSec, fraction });
        exercises.push({ name: s.exercise, sets: 1, reps: s.amount * fraction, weightKg: stationWeight(s.id, division), creditSets: 4 * fraction });
      }
    }
    if (!runTimes.length && !stations.length) errs.push('Enter at least one run or station time.');
    const hr = simHr.trim() ? Number(simHr) : undefined;
    if (hr !== undefined && !(hr >= 80 && hr <= 220)) errs.push('Average heart rate should be between 80 and 220 bpm.');
    const dur = duration.trim() ? Number(duration) : Math.ceil(simTotals.total / 60);
    if (!(dur > 0 && dur <= 600)) errs.push('Duration must be between 1 and 600 minutes.');
    setErrors(errs);
    if (errs.length) return;
    finish({
      date,
      type,
      title: `HYROX ${simLabel(sim)}`,
      durationMin: dur,
      intensity,
      exercises,
      stations: stations.length ? stations : undefined,
      hyrox: { sim, division, splits: hyroxSplits },
      run: runTimes.length ? { kind: 'Compromised', distanceKm: runTimes.length, paceSecPerKm: Math.round(runTimes.reduce((a, b) => a + b, 0) / runTimes.length), avgHr: hr } : undefined,
      notes: notes.trim() || undefined,
    });
  };

  const submitGeneral = () => {
    const errs: string[] = [];
    const dur = Number(duration);
    checkDate(errs);
    if (!(dur > 0 && dur <= 600)) errs.push('Duration must be between 1 and 600 minutes.');

    const exercises: ExerciseEntry[] = [];
    rows.forEach((r, i) => {
      const isCustom = r.name === CUSTOM;
      const name = isCustom ? r.customName.trim() : r.name;
      const sets = Number(r.sets);
      const reps = Number(r.reps);
      const weight = r.weight === '' ? undefined : Number(r.weight);
      if (!name && !r.sets && !r.reps) return; // empty row
      if (!name) errs.push(`Exercise ${i + 1}: enter a name.`);
      if (!(sets > 0 && Number.isInteger(sets))) errs.push(`Exercise ${i + 1}: sets must be a whole number above 0.`);
      if (!(reps > 0)) errs.push(`Exercise ${i + 1}: repetitions must be above 0.`);
      if (weight !== undefined && !(weight >= 0)) errs.push(`Exercise ${i + 1}: weight must be 0 or more.`);
      if (isCustom && r.customMuscles.length === 0) errs.push(`Exercise ${i + 1}: select at least one muscle group for a custom exercise.`);
      exercises.push({ name, sets, reps, weightKg: weight || undefined, customMuscles: isCustom ? r.customMuscles : undefined });
    });

    let run: Workout['run'];
    if (hasRun(type) && (runKm || runTime || runHr)) {
      const hr = Number(runHr);
      if (!(Number(runKm) > 0)) errs.push('Run: distance must be above 0 km.');
      if (!(pace > 120 && pace < 900)) errs.push('Run: enter a time as mm:ss (or h:mm:ss) giving a realistic pace.');
      if (!(hr >= 80 && hr <= 220)) errs.push('Run: average heart rate should be between 80 and 220 bpm.');
      run = { kind: runKind, distanceKm: Number(runKm), paceSecPerKm: Math.round(pace), avgHr: hr };
    }

    setErrors(errs);
    if (errs.length) return;
    finish({ date, type, title: title.trim() || DEFAULT_TITLE[type], durationMin: dur, intensity, exercises, run, notes: notes.trim() || undefined });
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Add workout"
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={submit}>Save workout</button>
          </>
        }
      >
        <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Prototype: workouts are kept in memory for this session only and immediately feed every chart and the muscle analysis. Reloading the page resets to the sample data.
        </p>
        {errors.length > 0 && (
          <ul className="mb-4 list-disc space-y-0.5 rounded-lg bg-rose-50 py-2 pl-7 pr-3 text-xs text-rose-700" role="alert">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="label" htmlFor="aw-date">Workout date</label>
            <input id="aw-date" type="date" className="input" value={date} min={DATA_START} max={today} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="aw-type">Workout type</label>
            <select id="aw-type" className="input" value={type} onChange={(e) => chooseType(e.target.value as WorkoutType)}>
              {WORKOUT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="aw-dur">Duration (min)</label>
            <input id="aw-dur" type="number" inputMode="numeric" min={1} className="input" value={duration} placeholder={type === 'HYROX' ? `auto ${Math.max(1, Math.ceil(simTotals.total / 60))}` : undefined} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="aw-rpe">Intensity (RPE {intensity}/10)</label>
            <input id="aw-rpe" type="range" min={1} max={10} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="mt-2 w-full accent-blue-600" />
          </div>
          {type !== 'HYROX' && (
            <div className="col-span-2 sm:col-span-4">
              <label className="label" htmlFor="aw-title">Title (optional)</label>
              <input id="aw-title" className="input" placeholder={DEFAULT_TITLE[type]} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          )}
        </div>

        {type === 'HYROX' ? (
          <HyroxSimFields sim={sim} onSim={setSim} division={division} onDivision={setDivision} splits={splits} onSplits={setSplits} hr={simHr} onHr={setSimHr} totals={simTotals} />
        ) : (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800">Exercises</h4>
              <button className="btn-ghost py-1.5 text-xs" onClick={() => setRows((rs) => [...rs, newRow()])}>
                <Plus size={14} /> Add exercise
              </button>
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => {
                const unit = EXERCISE_BY_NAME[r.name]?.repUnit === 'm' ? 'Distance (m)' : 'Reps';
                return (
                  <div key={r.key} className="rounded-xl border border-slate-200 p-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="label" htmlFor={`ex-${r.key}`}>Exercise {i + 1}</label>
                        <select id={`ex-${r.key}`} className="input" value={r.name} onChange={(e) => updateRow(r.key, { name: e.target.value })}>
                          <optgroup label="Tracked lifts">
                            {EXERCISES.filter((e) => e.tracked).map((e) => <option key={e.name}>{e.name}</option>)}
                          </optgroup>
                          <optgroup label="Accessory & HYROX">
                            {EXERCISES.filter((e) => !e.tracked).map((e) => <option key={e.name}>{e.name}</option>)}
                          </optgroup>
                          <option value={CUSTOM}>Custom exercise…</option>
                        </select>
                      </div>
                      <div>
                        <label className="label" htmlFor={`sets-${r.key}`}>Sets</label>
                        <input id={`sets-${r.key}`} type="number" min={1} className="input" value={r.sets} onChange={(e) => updateRow(r.key, { sets: e.target.value })} />
                      </div>
                      <div>
                        <label className="label" htmlFor={`reps-${r.key}`}>{unit}</label>
                        <input id={`reps-${r.key}`} type="number" min={1} className="input" value={r.reps} onChange={(e) => updateRow(r.key, { reps: e.target.value })} />
                      </div>
                      <div>
                        <label className="label" htmlFor={`w-${r.key}`}>Weight (kg)</label>
                        <input id={`w-${r.key}`} type="number" min={0} step={0.5} className="input" placeholder="BW" value={r.weight} onChange={(e) => updateRow(r.key, { weight: e.target.value })} />
                      </div>
                      <div className="flex items-end">
                        <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove exercise ${i + 1}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    {r.name === CUSTOM && (
                      <div className="mt-2 space-y-2">
                        <input className="input" placeholder="Exercise name" value={r.customName} onChange={(e) => updateRow(r.key, { customName: e.target.value })} aria-label="Custom exercise name" />
                        <div className="flex flex-wrap gap-1.5">
                          {MUSCLES.map((m) => {
                            const on = r.customMuscles.includes(m.id);
                            return (
                              <button key={m.id} onClick={() => updateRow(r.key, { customMuscles: on ? r.customMuscles.filter((x) => x !== m.id) : [...r.customMuscles, m.id] })} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">Leave a row's sets and reps empty to skip it. Weight is per hand for dumbbells and carries.</p>
          </div>
        )}

        {hasRun(type) && (
          <div className="mt-5">
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Running (optional)</h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <label className="label" htmlFor="run-kind">Run type</label>
                <select id="run-kind" className="input" value={runKind} onChange={(e) => setRunKind(e.target.value as RunKind)}>
                  {RUN_KINDS.map((k) => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="run-km">Distance (km)</label>
                <input id="run-km" type="number" min={0} step={0.1} className="input" value={runKm} onChange={(e) => setRunKm(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="run-time">Time (mm:ss)</label>
                <input id="run-time" className="input" placeholder="32:30" value={runTime} onChange={(e) => setRunTime(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="run-hr">Avg HR (bpm)</label>
                <input id="run-hr" type="number" className="input" value={runHr} onChange={(e) => setRunHr(e.target.value)} />
              </div>
            </div>
            {isFinite(pace) && <p className="mt-1.5 text-xs text-slate-500">Pace: {Math.floor(pace / 60)}:{String(Math.round(pace % 60)).padStart(2, '0')} /km</p>}
          </div>
        )}

        <div className="mt-5">
          <label className="label" htmlFor="aw-notes">Notes</label>
          <textarea id="aw-notes" rows={3} className="input" placeholder="How did it feel?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[60] w-max max-w-[calc(100vw-2rem)] lg:bottom-5 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg" role="status">
          <CheckCircle2 size={16} className="text-emerald-400" /> {toast}
        </div>
      )}
    </>
  );
}

function HyroxSimFields({
  sim,
  onSim,
  division,
  onDivision,
  splits,
  onSplits,
  hr,
  onHr,
  totals,
}: {
  sim: SimType;
  onSim: (s: SimType) => void;
  division: Division;
  onDivision: (d: Division) => void;
  splits: SplitInputs;
  onSplits: (fn: (s: SplitInputs) => SplitInputs) => void;
  hr: string;
  onHr: (v: string) => void;
  totals: { run: number; station: number; total: number };
}) {
  const fraction = simFraction(sim);
  const set = (id: StationId, key: 'run' | 'station', value: string) => onSplits((sp) => ({ ...sp, [id]: { ...sp[id], [key]: value } }));
  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        <div>
          <p className="label">Simulation</p>
          <Segmented<SimType> size="md" value={sim} onChange={onSim} options={SIM_TYPES.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
        <div>
          <p className="label">Weights</p>
          <div className="flex gap-2">
            <Segmented size="md" value={division.sex} onChange={(sex) => onDivision({ ...division, sex })} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
            <Segmented size="md" value={division.category} onChange={(category) => onDivision({ ...division, category })} options={[{ value: 'open', label: 'Open' }, { value: 'pro', label: 'Pro' }]} />
          </div>
        </div>
      </div>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <b className="font-semibold text-slate-800">{simLabel(sim)}</b> · {divisionLabel(division)} weights · 1 km run before every station
        {fraction < 1 ? ` · stations at ${fraction === 0.5 ? 'half' : '¾'} distance / reps` : ' · full race distances'}. Enter times as m:ss (or m.ss); leave blank anything you skipped.
      </p>

      <ol className="space-y-2">
        {STATIONS.map((s) => (
          <li key={s.id} className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">{s.order}</span>
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{s.name}</p>
              <span className="shrink-0 text-xs text-slate-500">{stationSpec(s.id, division, fraction)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor={`sim-run-${s.id}`}>Run 1 km</label>
                <input id={`sim-run-${s.id}`} inputMode="decimal" className="input" placeholder="5:30" value={splits[s.id].run} onChange={(e) => set(s.id, 'run', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={`sim-st-${s.id}`}>{s.name} time</label>
                <input id={`sim-st-${s.id}`} inputMode="decimal" className="input" placeholder="4:45" value={splits[s.id].station} onChange={(e) => set(s.id, 'station', e.target.value)} />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-blue-50 p-3 text-center">
        <div><p className="text-[11px] text-blue-700">Running</p><p className="text-base font-semibold text-slate-900">{fmtTime(totals.run)}</p></div>
        <div><p className="text-[11px] text-blue-700">Stations</p><p className="text-base font-semibold text-slate-900">{fmtTime(totals.station)}</p></div>
        <div><p className="text-[11px] text-blue-700">Total</p><p className="text-base font-semibold text-slate-900">{fmtTime(totals.total)}</p></div>
      </div>

      <div className="max-w-[200px]">
        <label className="label" htmlFor="sim-hr">Average HR (optional)</label>
        <input id="sim-hr" type="number" inputMode="numeric" className="input" placeholder="bpm" value={hr} onChange={(e) => onHr(e.target.value)} />
      </div>
    </div>
  );
}
