import { CheckCircle2, ChevronDown, ChevronUp, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EXERCISES, EXERCISE_BY_NAME, entryMeasure, exerciseMeasure } from '../data/exercises';
import { MUSCLES } from '../data/muscles';
import { SIM_TYPES, STATIONS, divisionLabel, simFraction, simLabel, stationSpec, stationWeight } from '../data/stations';
import { planKey, type CustomExercise, type Division, type DraftForm, type ExerciseEntry, type ExerciseMeasure, type HyroxSplit, type RunData, type RunKind, type SimType, type StationId, type StationResult, type Workout, type WorkoutType } from '../data/types';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { raceDivision, upcomingRaces } from '../lib/analytics';
import { fmtShort } from '../lib/dates';
import { fmtPace, fmtTime, parseTime } from '../lib/format';
import { WORKOUT_TYPES } from '../lib/theme';
import { Modal, Segmented } from './ui';

type ExerciseRow = DraftForm['rows'][number];
type RunRow = DraftForm['runRows'][number];

const CUSTOM = '__custom__';
/** Run types for pure running sessions. */
const RUN_KINDS: RunKind[] = ['Easy', 'Long', 'Tempo', 'Intervals', '5K Time Trial'];
const hasRun = (t: WorkoutType) => t === 'Running' || t === 'HYROX Engine';
/** Accepts "4:30" or "4.30" (easier on a phone number pad). */
const parseSplit = (text: string) => parseTime(text.trim().replace(/\./g, ':'));

type SplitInputs = Record<StationId, { run: string; station: string }>;
const emptySplits = () => Object.fromEntries(STATIONS.map((s) => [s.id, { run: '', station: '' }])) as SplitInputs;

let rowKey = 0;
const newRow = (name = 'Squat'): ExerciseRow => ({ key: rowKey++, name, customName: '', customMuscles: [], customMeasure: 'weight', saveTo: [], sets: '3', reps: '10', weight: '', distance: '', time: '' });
/** Workout types a custom exercise can be saved to. */
const SAVE_TO_TYPES: WorkoutType[] = ['HYROX Engine', 'Strength'];
const newRunRow = (): RunRow => ({ key: rowKey++, km: '', time: '' });

const blankForm = (today: string, division: Division): DraftForm => ({
  date: today,
  type: 'Strength',
  title: '',
  duration: '60',
  intensity: 7,
  rows: [newRow()],
  runKind: 'Easy',
  runRows: [newRunRow()],
  runHr: '',
  sim: 'full',
  division,
  splits: emptySplits(),
  simHr: '',
  notes: '',
});

export const DEFAULT_TITLE: Record<WorkoutType, string> = {
  F45: 'F45 Class',
  Strength: 'Strength Session',
  HYROX: 'HYROX Session',
  'HYROX Engine': 'HYROX Engine',
  Running: 'Run',
  Recovery: 'Recovery Session',
};

/** Best previous effort per exercise, shown in grey while logging. */
interface Best {
  label: string;
  /** Heaviest load, used as the weight field's placeholder. */
  weightKg?: number;
}

function bestEfforts(workouts: Workout[]): Record<string, Best> {
  const out: Record<string, Best & { score: number }> = {};
  for (const w of workouts)
    for (const e of w.exercises) {
      const m = entryMeasure(e);
      let score: number;
      let label: string;
      if (m === 'time') {
        if (!e.durationSec) continue;
        score = e.durationSec;
        label = `Best: ${fmtTime(e.durationSec)} hold`;
      } else if (m === 'distanceTime') {
        if (!e.distanceM || !e.durationSec) continue;
        score = -e.durationSec / e.distanceM; // faster pace is better
        label = `Best: ${e.distanceM} m in ${fmtTime(e.durationSec)} (${fmtTime((e.durationSec / e.distanceM) * 500)} /500m)`;
      } else {
        if (!e.weightKg) continue;
        score = e.weightKg * 1000 + (e.reps ?? 0);
        label = `Best: ${e.weightKg} kg × ${e.reps ?? '–'}`;
      }
      if (!out[e.name] || score > out[e.name].score) out[e.name] = { score, label: `${label} · ${fmtShort(w.date)}`, weightKg: m === 'weight' ? e.weightKg : undefined };
    }
  return out;
}

type PlannedRef = { date: string; type: WorkoutType };

/**
 * Workout form. Modes: a blank ad-hoc workout, continuing an open workout
 * (draftId), planning a day's workout ahead (plan), or starting a planned
 * workout pre-filled with its plan (start).
 */
export function AddWorkoutModal({ draftId, date: forDate, plan, start, onClose }: { draftId?: string; date?: string; plan?: PlannedRef; start?: PlannedRef; onClose: () => void }) {
  const { addWorkout, today, goals, drafts, saveDraft, deleteDraft, workouts, customExercises, saveCustomExercises, planDetails, setPlanDetail } = useData();
  const savedCustom = (name: string) => customExercises.find((c) => c.name === name);
  /** How a row is logged: chosen for a new custom exercise, saved for a reused one, else from the library. */
  const rowMeasure = (r: ExerciseRow): ExerciseMeasure => (r.name === CUSTOM ? r.customMeasure : savedCustom(r.name)?.measure ?? exerciseMeasure(r.name));
  const { notify } = useUI();
  const nextRace = upcomingRaces(goals, today)[0];
  const defaultDivision: Division = nextRace ? raceDivision(nextRace, goals.athleteSex) : { sex: goals.athleteSex, category: 'open' };
  const draft = drafts.find((d) => d.id === draftId);
  const planRef = plan ?? start;
  // Initial values: the open workout being continued, the saved plan, or a blank form.
  const [init] = useState<DraftForm>(() => {
    if (draft) return draft.form;
    if (planRef) {
      const saved = planDetails[planKey(planRef.date, planRef.type)];
      const base = saved ?? { ...blankForm(planRef.date, defaultDivision), duration: planRef.type === 'HYROX' ? '' : '60' };
      // A planned workout is logged on its own day (today, or an earlier day being filled in).
      return { ...base, type: planRef.type, date: plan ? plan.date : start && start.date < today ? start.date : today };
    }
    return blankForm(forDate && forDate <= today ? forDate : today, defaultDivision);
  });
  /** Open-workout id for Save: the one being continued, or a new one. */
  const [ownId] = useState(() => draftId ?? `draft-${Date.now()}`);
  const locked = !!planRef || !!draft?.fromPlan;
  const [date, setDate] = useState(init.date);
  const [type, setType] = useState<WorkoutType>(init.type);
  const [title, setTitle] = useState(init.title);
  const [duration, setDuration] = useState(init.duration);
  const [intensity, setIntensity] = useState(init.intensity);
  const [rows, setRows] = useState<ExerciseRow[]>(init.rows);
  const [runKind, setRunKind] = useState<RunKind>(init.runKind);
  const [runRows, setRunRows] = useState<RunRow[]>(init.runRows);
  const [runHr, setRunHr] = useState(init.runHr);
  const [order, setOrder] = useState<number[]>(init.order ?? []);
  const [sim, setSim] = useState<SimType>(init.sim);
  const [division, setDivision] = useState<Division>(init.division);
  const [splits, setSplits] = useState<SplitInputs>(init.splits);
  const [simHr, setSimHr] = useState(init.simHr);
  const [notes, setNotes] = useState(init.notes);
  const [errors, setErrors] = useState<string[]>([]);
  const errorsRef = useRef<HTMLUListElement>(null);
  // Completed sits at the bottom of a long form: bring problems into view.
  useEffect(() => {
    if (errors.length) errorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [errors]);
  const bests = useMemo(() => bestEfforts(workouts), [workouts]);

  const formValues = (): DraftForm => ({ date, type, title, duration, intensity, rows, runKind, runRows, runHr, order: type === 'HYROX Engine' ? sequenceKeys : undefined, sim, division, splits, simHr, notes });

  /** Keeps the workout open so it can be continued later. */
  const saveOpen = () => {
    saveDraft({ id: ownId, savedAt: new Date().toISOString(), form: formValues(), fromPlan: draft?.fromPlan ?? (start ? planKey(start.date, start.type) : undefined) });
    notify('Workout saved — continue it any time from the open workout bar.');
    onClose();
  };

  /** Stores the exercises planned for this day's workout. */
  const savePlan = () => {
    if (!plan) return;
    setPlanDetail(planKey(plan.date, plan.type), formValues());
    notify(`${plan.type} plan saved for ${fmtShort(plan.date)}.`);
    onClose();
  };

  // HYROX Engine: runs and exercises in the order they are done (new rows go last).
  const sequenceKeys = useMemo(() => {
    const live = new Set([...rows.map((r) => r.key), ...runRows.map((r) => r.key)]);
    const kept = order.filter((k) => live.has(k));
    const seen = new Set(kept);
    return [...kept, ...rows.map((r) => r.key).filter((k) => !seen.has(k)), ...runRows.map((r) => r.key).filter((k) => !seen.has(k))];
  }, [order, rows, runRows]);
  const moveItem = (key: number, dir: -1 | 1) => {
    const keys = [...sequenceKeys];
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setOrder(keys);
  };

  // New rows scroll into view so the next exercise or run can be filled straight away.
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(scrollTo)?.closest('.rounded-xl')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setScrollTo(null);
  }, [scrollTo]);
  const addExercise = () => {
    const row = newRow();
    setRows((rs) => [...rs, row]);
    setScrollTo(`ex-${row.key}`);
  };
  const addRun = () => {
    const row = newRunRow();
    setRunRows((rs) => [...rs, row]);
    setScrollTo(`rkm-${row.key}`);
  };
  /** Full-width button under a list, so adding the next item needs no scrolling back up. */
  const addMoreButton = (label: string, onClick: () => void) => (
    <button className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50" onClick={onClick}>
      <Plus size={15} /> {label}
    </button>
  );

  const updateRow = (key: number, patch: Partial<ExerciseRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const updateRun = (key: number, patch: Partial<RunRow>) => setRunRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const runTotals = useMemo(() => {
    let km = 0;
    let sec = 0;
    for (const r of runRows) {
      const d = Number(r.km);
      const t = parseSplit(r.time);
      if (d > 0 && t > 0) {
        km += d;
        sec += t;
      }
    }
    return { km: Math.round(km * 100) / 100, sec, pace: km ? sec / km : 0 };
  }, [runRows]);

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
    else if (date > today) errs.push("The date can't be in the future.");
  };

  const finish = (w: Omit<Workout, 'id' | 'isSample'>) => {
    addWorkout(w);
    deleteDraft(ownId); // no-op when the workout was never saved open
    notify(w.hyrox ? `${w.title} completed. See how it compares with your bests on HYROX Performance.` : `${w.title} completed — added to the workout log.`);
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
        exercises.push(
          exerciseMeasure(s.exercise) === 'distanceTime'
            ? { name: s.exercise, sets: 1, distanceM: s.amount * fraction, durationSec: stationSec, creditSets: 4 * fraction }
            : { name: s.exercise, sets: 1, reps: s.amount * fraction, weightKg: stationWeight(s.id, division), creditSets: 4 * fraction },
        );
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
      run: runTimes.length
        ? { kind: 'Compromised', distanceKm: runTimes.length, paceSecPerKm: Math.round(runTimes.reduce((a, b) => a + b, 0) / runTimes.length), avgHr: hr, segments: runTimes.map((t) => ({ distanceKm: 1, timeSec: t })) }
        : undefined,
      notes: notes.trim() || undefined,
    });
  };

  const isEmptyRun = (r: RunRow) => !r.km.trim() && !r.time.trim();
  const isEmptyExercise = (r: ExerciseRow) => !r.reps && !r.weight && !r.distance && !r.time && !(r.name === CUSTOM && r.customName.trim());

  /** Builds the run (one or more runs / intervals) for Running and HYROX Engine. */
  const buildRun = (errs: string[]): RunData | undefined => {
    const segments: { distanceKm: number; timeSec: number }[] = [];
    runRows.forEach((r, i) => {
      if (isEmptyRun(r)) return;
      const km = Number(r.km);
      const sec = parseSplit(r.time);
      if (!(km > 0 && km <= 100)) errs.push(`Run ${i + 1}: enter a distance in km.`);
      else if (!(sec > 0 && sec / km >= 120 && sec / km <= 900)) errs.push(`Run ${i + 1}: enter a time as m:ss (or h:mm:ss) giving a realistic pace.`);
      else segments.push({ distanceKm: km, timeSec: sec });
    });
    const hr = runHr.trim() ? Number(runHr) : undefined;
    if (hr !== undefined && !(hr >= 80 && hr <= 220)) errs.push('Average heart rate should be between 80 and 220 bpm.');
    if (!segments.length) return undefined;
    const km = segments.reduce((a, x) => a + x.distanceKm, 0);
    const sec = segments.reduce((a, x) => a + x.timeSec, 0);
    const kind: RunKind = type === 'Running' ? runKind : segments.length > 1 ? 'Intervals' : 'Compromised';
    return { kind, distanceKm: Math.round(km * 100) / 100, paceSecPerKm: Math.round(sec / km), avgHr: hr, segments };
  };

  const submitGeneral = () => {
    const errs: string[] = [];
    checkDate(errs);
    const run = hasRun(type) ? buildRun(errs) : undefined;
    const isRunning = type === 'Running';
    if (isRunning && !run && !errs.length) errs.push('Add at least one run with a distance and time.');
    const dur = isRunning ? Math.ceil(runTotals.sec / 60) : Number(duration);
    if (!isRunning && !(dur > 0 && dur <= 600)) errs.push('Duration must be between 1 and 600 minutes.');

    const exercises: ExerciseEntry[] = [];
    const newCustoms: CustomExercise[] = [];
    if (!isRunning)
      rows.forEach((r, i) => {
        const isCustom = r.name === CUSTOM;
        const name = isCustom ? r.customName.trim() : r.name;
        const measure = rowMeasure(r);
        // Saved custom exercises carry their muscle groups on every entry.
        const muscles = isCustom ? r.customMuscles : savedCustom(r.name)?.muscles;
        const n = `Exercise ${i + 1}${name ? ` (${name})` : ''}`;
        if (isEmptyExercise(r)) return;
        const sets = Number(r.sets);
        if (!name) errs.push(`Exercise ${i + 1}: enter a name.`);
        if (!(sets > 0 && Number.isInteger(sets))) errs.push(`${n}: sets must be a whole number above 0.`);
        if (isCustom && r.customMuscles.length === 0) errs.push(`${n}: select at least one muscle group for a custom exercise.`);
        if (isCustom && name && EXERCISE_BY_NAME[name]) errs.push(`${n}: "${name}" is already in the exercise list — pick it there.`);
        if (isCustom && name && r.saveTo.length) newCustoms.push({ name, measure, muscles: r.customMuscles, types: r.saveTo });
        if (measure === 'weight') {
          const reps = Number(r.reps);
          const weight = r.weight === '' ? undefined : Number(r.weight);
          if (!(reps > 0)) errs.push(`${n}: repetitions must be above 0.`);
          if (weight !== undefined && !(weight >= 0)) errs.push(`${n}: weight must be 0 or more.`);
          exercises.push({ name, sets, reps, weightKg: weight || undefined, customMuscles: muscles });
        } else {
          const sec = parseSplit(r.time);
          if (!(sec > 0 && sec < 3 * 3600)) errs.push(`${n}: enter a time as m:ss.`);
          if (measure === 'distanceTime') {
            const m = Number(r.distance);
            if (!(m > 0)) errs.push(`${n}: enter a distance in metres.`);
            exercises.push({ name, sets, distanceM: m, durationSec: sec, customMuscles: muscles });
          } else exercises.push({ name, sets, durationSec: sec, customMuscles: muscles });
        }
      });

    setErrors(errs);
    if (errs.length) return;
    if (newCustoms.length) saveCustomExercises(newCustoms);
    // HYROX Engine: remember whether runs or exercises came first, or in between.
    const sequence =
      type === 'HYROX Engine' && run && exercises.length
        ? sequenceKeys.flatMap((key): ('run' | 'exercise')[] => {
            const ex = rows.find((r) => r.key === key);
            if (ex) return isEmptyExercise(ex) ? [] : ['exercise'];
            const rr = runRows.find((r) => r.key === key);
            return rr && !isEmptyRun(rr) ? ['run'] : [];
          })
        : undefined;
    finish({
      date,
      type,
      title: isRunning ? `${runKind} Run` : title.trim() || DEFAULT_TITLE[type],
      durationMin: Math.max(1, dur),
      intensity,
      exercises,
      run,
      sequence,
      notes: notes.trim() || undefined,
    });
  };

  /**
   * Exercise choices in alphabetical order: the library (distance + time machines
   * are left out of Strength) plus custom exercises saved for this workout type.
   */
  const exerciseOptions = (current: string) =>
    [
      ...EXERCISES.filter((e) => type !== 'Strength' || e.measure !== 'distanceTime' || e.name === current).map((e) => e.name),
      ...customExercises.filter((c) => c.types.includes(type) || c.name === current).map((c) => c.name),
    ].sort((a, b) => a.localeCompare(b));

  const renderExercise = (r: ExerciseRow, i: number, controls?: ReactNode) => {
    const isCustom = r.name === CUSTOM;
    const measure = rowMeasure(r);
    const best = isCustom ? undefined : bests[r.name];
    const options = exerciseOptions(r.name);
    return (
      <div key={r.key} className="rounded-xl border border-slate-200 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor={`ex-${r.key}`}>Exercise {i + 1}</label>
            <select id={`ex-${r.key}`} className="input" value={r.name} onChange={(e) => updateRow(r.key, { name: e.target.value })}>
              {options.map((name) => (
                <option key={name} value={name}>
                  {name}
                  {savedCustom(name) ? ' (my exercise)' : ''}
                </option>
              ))}
              <option value={CUSTOM}>Custom exercise…</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`sets-${r.key}`}>{measure === 'distanceTime' ? 'Rounds' : 'Sets'}</label>
            <input id={`sets-${r.key}`} type="number" inputMode="numeric" min={1} className="input" value={r.sets} onChange={(e) => updateRow(r.key, { sets: e.target.value })} />
          </div>
          {measure === 'weight' && (
            <>
              <div>
                <label className="label" htmlFor={`reps-${r.key}`}>{EXERCISE_BY_NAME[r.name]?.repUnit === 'm' ? 'Distance (m)' : 'Reps'}</label>
                <input id={`reps-${r.key}`} type="number" inputMode="numeric" min={1} className="input" value={r.reps} onChange={(e) => updateRow(r.key, { reps: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor={`w-${r.key}`}>Weight (kg)</label>
                <input id={`w-${r.key}`} type="number" inputMode="decimal" min={0} step={0.5} className="input placeholder:text-slate-400" placeholder={best?.weightKg ? `Best ${best.weightKg}` : 'BW'} value={r.weight} onChange={(e) => updateRow(r.key, { weight: e.target.value })} />
              </div>
            </>
          )}
          {measure === 'distanceTime' && (
            <div>
              <label className="label" htmlFor={`dist-${r.key}`}>Distance (m)</label>
              <input id={`dist-${r.key}`} type="number" inputMode="numeric" min={1} className="input" placeholder="500" value={r.distance} onChange={(e) => updateRow(r.key, { distance: e.target.value })} />
            </div>
          )}
          {measure !== 'weight' && (
            <div className={measure === 'time' ? 'sm:col-span-2' : ''}>
              <label className="label" htmlFor={`time-${r.key}`}>{measure === 'time' ? 'Time per set (m:ss)' : 'Time (m:ss)'}</label>
              <input id={`time-${r.key}`} inputMode="decimal" className="input" placeholder={measure === 'time' ? '0:45' : '1:50'} value={r.time} onChange={(e) => updateRow(r.key, { time: e.target.value })} />
            </div>
          )}
          <div className="flex items-end">
            {controls}
            <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove exercise ${i + 1}`}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        {best && <p className="mt-1.5 text-xs text-slate-400">{best.label}</p>}
        {isCustom && (
          <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">
            <input className="input" placeholder="Exercise name" value={r.customName} onChange={(e) => updateRow(r.key, { customName: e.target.value })} aria-label="Custom exercise name" />
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <div>
                <p className="label">Count by</p>
                <Segmented
                  size="md"
                  value={r.customMeasure === 'weight' ? 'reps' : 'time'}
                  onChange={(v) => updateRow(r.key, { customMeasure: v === 'reps' ? 'weight' : 'time' })}
                  options={[{ value: 'reps', label: 'Reps' }, { value: 'time', label: 'Time' }]}
                />
              </div>
              {r.customMeasure !== 'weight' && (
                <div>
                  <p className="label">Time based on</p>
                  <Segmented<ExerciseMeasure>
                    size="md"
                    value={r.customMeasure}
                    onChange={(v) => updateRow(r.key, { customMeasure: v })}
                    options={[{ value: 'distanceTime', label: 'Distance + time' }, { value: 'time', label: 'Time only' }]}
                  />
                </div>
              )}
            </div>
            <p className="label !mb-0">Muscle groups</p>
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
            <div>
              <p className="label">Save to my exercises for future</p>
              <div className="flex flex-wrap gap-3">
                {SAVE_TO_TYPES.map((t) => (
                  <label key={t} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={r.saveTo.includes(t)} onChange={(e) => updateRow(r.key, { saveTo: e.target.checked ? [...r.saveTo, t] : r.saveTo.filter((x) => x !== t) })} />
                    {t}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Once you tap Completed it appears in the exercise list for those workout types.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRun = (r: RunRow, i: number, controls?: ReactNode) => {
    const km = Number(r.km);
    const sec = parseSplit(r.time);
    return (
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-xl border border-slate-200 p-3">
        <div>
          <label className="label" htmlFor={`rkm-${r.key}`}>Run {i + 1} · distance (km)</label>
          <input id={`rkm-${r.key}`} type="number" inputMode="decimal" min={0} step={0.1} className="input" placeholder="1" value={r.km} onChange={(e) => updateRun(r.key, { km: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`rt-${r.key}`}>Time (m:ss)</label>
          <input id={`rt-${r.key}`} inputMode="decimal" className="input" placeholder="5:15" value={r.time} onChange={(e) => updateRun(r.key, { time: e.target.value })} />
        </div>
        <div className="mb-0.5 flex items-center">
          {controls}
          <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" disabled={runRows.length === 1} onClick={() => setRunRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove run ${i + 1}`}>
            <Trash2 size={16} />
          </button>
        </div>
        {km > 0 && sec > 0 && <p className="col-span-3 -mt-1 text-xs text-slate-500">Pace {fmtPace(sec / km)} /km</p>}
      </div>
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={plan ? `Plan ${plan.type} · ${fmtShort(plan.date)}` : draft ? 'Continue workout' : start ? `Start ${start.type}` : 'Add workout'}
      wide
      footer={
        <>
          <button className="btn-ghost mr-auto" onClick={onClose}>Close</button>
          {plan ? (
            <button className="btn-primary" onClick={savePlan}>
              <Save size={15} /> Save plan
            </button>
          ) : (
            <>
              <button className="btn-ghost" onClick={saveOpen}>
                <Save size={15} /> Save
              </button>
              <button className="btn-primary" onClick={submit}>
                <CheckCircle2 size={15} /> Completed
              </button>
            </>
          )}
        </>
      }
    >
      {plan ? (
        <p className="mb-4 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
          Plan the exercises, sets, reps and target weights (or runs and times) for this workout. On the day, tap <b className="font-semibold">Start workout</b> at the top of the app to log it from this plan.
        </p>
      ) : (
        <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {start && <span className="mb-1 block font-semibold">Pre-filled from your plan — adjust anything you changed on the day.</span>}
          <b className="font-semibold">Save</b> keeps this workout open so you can keep logging sets and times. Tap <b className="font-semibold">Completed</b> when you finish — only then is it added to the workout log and charts.
          {draft && <span className="mt-1 block text-blue-700/80">Last saved {new Date(draft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</span>}
        </p>
      )}
      {errors.length > 0 && (
        <ul ref={errorsRef} className="mb-4 list-disc space-y-0.5 rounded-lg bg-rose-50 py-2 pl-7 pr-3 text-xs text-rose-700" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="aw-date">Workout date</label>
          <input id="aw-date" type="date" className="input disabled:bg-slate-50 disabled:text-slate-600" disabled={locked} value={date} max={plan ? undefined : today} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="aw-type">Workout type</label>
          <select id="aw-type" className="input disabled:bg-slate-50 disabled:text-slate-600" disabled={locked} value={type} onChange={(e) => chooseType(e.target.value as WorkoutType)}>
            {WORKOUT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        {type !== 'Running' && (
          <div>
            <label className="label" htmlFor="aw-dur">Duration (min)</label>
            <input id="aw-dur" type="number" inputMode="numeric" min={1} className="input" value={duration} placeholder={type === 'HYROX' ? `auto ${Math.max(1, Math.ceil(simTotals.total / 60))}` : undefined} onChange={(e) => setDuration(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="aw-rpe">Intensity (RPE {intensity}/10)</label>
          <input id="aw-rpe" type="range" min={1} max={10} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="mt-2 w-full accent-blue-600" />
        </div>
        {type !== 'HYROX' && type !== 'Running' && (
          <div className="col-span-2 sm:col-span-4">
            <label className="label" htmlFor="aw-title">Title (optional)</label>
            <input id="aw-title" className="input" placeholder={DEFAULT_TITLE[type]} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}
      </div>

      {type === 'HYROX' && <HyroxSimFields sim={sim} onSim={setSim} division={division} onDivision={setDivision} splits={splits} onSplits={setSplits} hr={simHr} onHr={setSimHr} totals={simTotals} />}

      {type === 'HYROX Engine' && (
        <div className="mt-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-800">Runs & exercises</h4>
            <div className="flex gap-1.5">
              <button className="btn-ghost py-1.5 text-xs" onClick={addExercise}>
                <Plus size={14} /> Add exercise
              </button>
              <button className="btn-ghost py-1.5 text-xs" onClick={addRun}>
                <Plus size={14} /> Add run
              </button>
            </div>
          </div>
          <p className="mb-2 text-[11px] text-slate-500">In the order you do them: use the arrows to put a run first, last or in between exercises.</p>
          <ol className="space-y-2">
            {(() => {
              let ex = 0;
              let run = 0;
              return sequenceKeys.map((key, idx) => {
                const controls = (
                  <span className="mr-1 flex flex-col">
                    <button className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" disabled={idx === 0} onClick={() => moveItem(key, -1)} aria-label="Move up">
                      <ChevronUp size={16} />
                    </button>
                    <button className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" disabled={idx === sequenceKeys.length - 1} onClick={() => moveItem(key, 1)} aria-label="Move down">
                      <ChevronDown size={16} />
                    </button>
                  </span>
                );
                const exRow = rows.find((r) => r.key === key);
                if (exRow) return <li key={key}>{renderExercise(exRow, ex++, controls)}</li>;
                const runRow = runRows.find((r) => r.key === key)!;
                return <li key={key}>{renderRun(runRow, run++, controls)}</li>;
              });
            })()}
          </ol>
          <div className="grid grid-cols-2 gap-2">
            {addMoreButton('Add exercise', addExercise)}
            {addMoreButton('Add run', addRun)}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">Grey text shows your best previous effort for each exercise. Weight is per hand for dumbbells and carries.</p>
        </div>
      )}

      {type !== 'HYROX' && type !== 'Running' && type !== 'HYROX Engine' && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">Exercises</h4>
            <button className="btn-ghost py-1.5 text-xs" onClick={addExercise}>
              <Plus size={14} /> Add exercise
            </button>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => renderExercise(r, i))}
          </div>
          {addMoreButton('Add another exercise', addExercise)}
          <p className="mt-1.5 text-[11px] text-slate-500">
            Grey text shows your best previous effort for each exercise. Weight is per hand for dumbbells and carries.
            {type === 'Strength' && ' Cardio machines (distance & time) are logged under HYROX Engine or F45.'}
          </p>
        </div>
      )}

      {hasRun(type) && (
        <div className="mt-5">
          {type === 'Running' ? (
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800">Running</h4>
              <button className="btn-ghost py-1.5 text-xs" onClick={addRun}>
                <Plus size={14} /> Add run
              </button>
            </div>
          ) : (
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Hyrox Run totals</h4>
          )}
          {type === 'Running' && (
            <div className="mb-2 max-w-[220px]">
              <label className="label" htmlFor="run-kind">Run type</label>
              <select id="run-kind" className="input" value={runKind} onChange={(e) => setRunKind(e.target.value as RunKind)}>
                {RUN_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </div>
          )}
          {type === 'Running' && (
            <ol className="space-y-2">
              {runRows.map((r, i) => <li key={r.key}>{renderRun(r, i)}</li>)}
            </ol>
          )}
          {type === 'Running' && addMoreButton('Add another run', addRun)}
          <div className="mt-2 grid grid-cols-3 items-end gap-2">
            <div className="rounded-xl bg-blue-50 px-3 py-2 text-center">
              <p className="text-[11px] text-blue-700">Distance</p>
              <p className="text-sm font-semibold text-slate-900">{runTotals.km} km</p>
            </div>
            <div className="rounded-xl bg-blue-50 px-3 py-2 text-center">
              <p className="text-[11px] text-blue-700">{type === 'Running' ? 'Time (duration)' : 'Run time'}</p>
              <p className="text-sm font-semibold text-slate-900">{fmtTime(runTotals.sec)}</p>
            </div>
            <div className="rounded-xl bg-blue-50 px-3 py-2 text-center">
              <p className="text-[11px] text-blue-700">Avg pace</p>
              <p className="text-sm font-semibold text-slate-900">{runTotals.pace ? `${fmtPace(runTotals.pace)}/km` : '—'}</p>
            </div>
          </div>
          <div className="mt-2 max-w-[200px]">
            <label className="label" htmlFor="run-hr">Average HR (optional)</label>
            <input id="run-hr" type="number" inputMode="numeric" className="input" placeholder="bpm" value={runHr} onChange={(e) => setRunHr(e.target.value)} />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {type === 'Running' ? 'Add a row for each run or interval with its own distance and time.' : 'Runs in HYROX Engine sessions are recorded as Hyrox Run on the Running page.'}
          </p>
        </div>
      )}

      <div className="mt-5">
        <label className="label" htmlFor="aw-notes">Notes</label>
        <textarea id="aw-notes" rows={3} className="input" placeholder="How did it feel?" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
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
