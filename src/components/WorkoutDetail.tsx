import { Clock, Flame, Gauge, HeartPulse, Route, Trash2, Pencil } from 'lucide-react';
import { EXERCISE_BY_NAME, entryMeasure } from '../data/exercises';
import { MUSCLE_BY_ID } from '../data/muscles';
import { STATION_BY_ID, divisionLabel, simFraction, simLabel, stationSpec } from '../data/stations';
import type { ExerciseEntry, Workout } from '../data/types';
import { sessionLoad, workoutMuscles } from '../lib/analytics';
import { fmtLong } from '../lib/dates';
import { fmtDuration, fmtPace, fmtTime } from '../lib/format';
import { DemoBadge, MiniStat, TypeBadge } from './ui';
import { SimComparison } from './SimAnalysis';

export const fmtSetsReps = (e: ExerciseEntry) => {
  const m = entryMeasure(e);
  if (m === 'time') return `${e.sets} × ${e.durationSec ? fmtTime(e.durationSec) : '—'}`;
  if (m === 'distanceTime') return `${e.sets > 1 ? `${e.sets} × ` : ''}${e.distanceM ?? '—'} m${e.durationSec ? ` in ${fmtTime(e.durationSec)}` : ''}`;
  const unit = EXERCISE_BY_NAME[e.name]?.repUnit === 'm' ? ' m' : '';
  return `${e.sets} × ${e.reps ?? '—'}${unit}`;
};

/** Load column: weight, or pace for distance + time machines. */
const fmtLoad = (e: ExerciseEntry) => {
  const m = entryMeasure(e);
  if (m === 'distanceTime') return e.distanceM && e.durationSec ? `${fmtTime((e.durationSec / e.distanceM) * 500)} /500m` : '—';
  if (m === 'time') return '—';
  return e.weightKg ? `${e.weightKg} kg` : 'BW';
};

/** "Running" for pure runs; runs inside HYROX sessions are "Hyrox Run". */
export const runCategory = (w: Workout) => (w.type === 'Running' ? 'Running' : 'Hyrox Run');

export function IntensityBar({ value }: { value: number }) {
  const tone = value >= 8 ? 'bg-rose-500' : value >= 6 ? 'bg-amber-400' : value >= 4 ? 'bg-blue-500' : 'bg-emerald-500';
  return (
    <span className="inline-flex items-center gap-2" title={`RPE ${value}/10`}>
      <span className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`h-2.5 w-1.5 rounded-sm ${i < value ? tone : 'bg-slate-200'}`} />
        ))}
      </span>
      <span className="text-xs font-medium text-slate-600">{value}/10</span>
    </span>
  );
}

export function WorkoutDetail({ workout, onRemove, onEdit }: { workout: Workout; onRemove?: () => void; onEdit?: () => void }) {
  const muscles = workoutMuscles(workout);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={workout.type} />
        <span className="text-sm text-slate-500">{fmtLong(workout.date)}</span>
        {workout.isSample ? (
          <DemoBadge text="Sample workout" />
        ) : workout.fromPlan ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">Done from plan{workout.exercises.length || workout.run ? '' : ' · no details logged'}</span>
        ) : (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">Logged</span>
        )}
      </div>
      <h3 className="-mt-2 text-lg font-semibold text-slate-900">{workout.title}</h3>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MiniStat label="Duration" value={<span className="inline-flex items-center gap-1.5"><Clock size={14} className="text-slate-400" />{fmtDuration(workout.durationMin)}</span>} />
        <MiniStat label="Intensity (RPE)" value={<IntensityBar value={workout.intensity} />} />
        <MiniStat label="Training load" value={<span className="inline-flex items-center gap-1.5"><Flame size={14} className="text-slate-400" />{sessionLoad(workout)}</span>} sub="duration × RPE" />
      </div>

      {workout.hyrox && <HyroxSplits workout={workout} />}
      {workout.hyrox && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Compared with your best runs and stations</h4>
          <SimComparison workout={workout} />
        </div>
      )}

      {workout.run && !workout.hyrox && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {runCategory(workout)}
            {workout.type === 'Running' && ` · ${workout.run.kind}`}
          </h4>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Distance" value={<span className="inline-flex items-center gap-1.5"><Route size={14} className="text-slate-400" />{workout.run.distanceKm} km</span>} />
            <MiniStat label="Avg pace" value={<span className="inline-flex items-center gap-1.5"><Gauge size={14} className="text-slate-400" />{fmtPace(workout.run.paceSecPerKm)}/km</span>} />
            <MiniStat label="Avg HR" value={<span className="inline-flex items-center gap-1.5"><HeartPulse size={14} className="text-slate-400" />{workout.run.avgHr ? `${workout.run.avgHr} bpm` : '—'}</span>} />
          </div>
          {workout.run.segments && workout.run.segments.length > 1 && !workout.sequence && (
            <ol className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-sm">
              {workout.run.segments.map((seg, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="text-slate-600">Run {i + 1} · {seg.distanceKm} km</span>
                  <span className="font-medium text-slate-900">
                    {fmtTime(seg.timeSec)} <span className="font-normal text-slate-500">· {fmtPace(seg.timeSec / seg.distanceKm)}/km</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {workout.sequence && <SequenceList workout={workout} />}

      {workout.exercises.length > 0 && !workout.hyrox && !workout.sequence && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Exercises</h4>
          {workout.assumedExercises && (
            <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">No exercises were logged, so this F45 class is counted as a full-body functional workout at about 80% of your best weights.</p>
          )}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Exercise</th>
                  <th className="px-3 py-2 font-medium">Sets / distance / time</th>
                  <th className="px-3 py-2 text-right font-medium">Load / pace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workout.exercises.map((e, i) => (
                  <tr key={`${e.name}-${i}`}>
                    <td className="px-3 py-2 text-slate-800">{e.name}</td>
                    <td className="px-3 py-2 text-slate-600">{fmtSetsReps(e)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmtLoad(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {workout.stations && workout.stations.length > 0 && !workout.hyrox && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">HYROX station times</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {workout.stations.map((s) => (
              <MiniStat key={s.station} label={STATION_BY_ID[s.station].name} value={fmtTime(s.timeSec)} sub={stationSpec(s.station, { sex: 'female', category: 'open' }, s.fraction)} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Muscle groups trained</h4>
        {muscles.length ? (
          <div className="flex flex-wrap gap-1.5">
            {muscles.map((m) => (
              <span key={m} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{MUSCLE_BY_ID[m].label}</span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{workout.type === 'Recovery' ? 'Recovery session — no working sets recorded.' : 'No strength exercises recorded.'}</p>
        )}
      </div>

      {workout.notes && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</h4>
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{workout.notes}</p>
        </div>
      )}

      {!workout.isSample && (onEdit || onRemove) && (
        <div className="flex flex-wrap gap-2">
          {/* Workouts counted from the plan aren't logged yet, so there is nothing to edit. */}
          {onEdit && !workout.fromPlan && (
            <button onClick={onEdit} className="btn-ghost text-blue-700 hover:bg-blue-50">
              <Pencil size={15} /> Edit workout
            </button>
          )}
          {onRemove && (
            <button onClick={onRemove} className="btn-ghost text-rose-600 hover:bg-rose-50">
              <Trash2 size={15} /> {workout.fromPlan ? 'Remove from plan' : 'Remove this workout'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function HyroxSplits({ workout }: { workout: Workout }) {
  const h = workout.hyrox!;
  const fraction = simFraction(h.sim);
  const total = h.splits.reduce((a, s) => a + (s.runSec ?? 0) + (s.stationSec ?? 0), 0);
  const runTotal = h.splits.reduce((a, s) => a + (s.runSec ?? 0), 0);
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {simLabel(h.sim)} · {divisionLabel(h.division)} weights
      </h4>
      <div className="mb-2 grid grid-cols-3 gap-2">
        <MiniStat label="Total" value={fmtTime(total)} />
        <MiniStat label="Running" value={fmtTime(runTotal)} sub={workout.run ? `${fmtPace(workout.run.paceSecPerKm)}/km avg` : undefined} />
        <MiniStat label="Avg HR" value={workout.run?.avgHr ? `${workout.run.avgHr} bpm` : '—'} />
      </div>
      <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-sm">
        {h.splits.map((s) => {
          const st = STATION_BY_ID[s.station];
          return (
            <li key={s.station} className="flex items-center gap-3 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{st.order}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800">{st.name}</span>
                <span className="block text-xs text-slate-500">{stationSpec(s.station, h.division, fraction)}</span>
              </span>
              <span className="w-14 shrink-0 text-right text-xs text-slate-500">
                <span className="block text-[10px] uppercase tracking-wide">Run</span>
                {s.runSec ? fmtTime(s.runSec) : '—'}
              </span>
              <span className="w-14 shrink-0 text-right font-medium text-slate-900">
                <span className="block text-[10px] font-normal uppercase tracking-wide text-slate-500">Station</span>
                {s.stationSec ? fmtTime(s.stationSec) : '—'}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** HYROX Engine runs and exercises in the order they were done. */
function SequenceList({ workout }: { workout: Workout }) {
  let ex = 0;
  let run = 0;
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Runs & exercises in order</h4>
      <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-sm">
        {workout.sequence!.map((kind, i) => {
          if (kind === 'run') {
            const seg = workout.run?.segments?.[run];
            const n = ++run;
            return (
              <li key={i} className="flex items-center justify-between gap-3 bg-blue-50/40 px-3 py-2">
                <span className="flex items-center gap-2 text-slate-700"><Route size={14} className="text-blue-500" /> Run {n}{seg ? ` · ${seg.distanceKm} km` : ''}</span>
                {seg && (
                  <span className="font-medium text-slate-900">
                    {fmtTime(seg.timeSec)} <span className="font-normal text-slate-500">· {fmtPace(seg.timeSec / seg.distanceKm)}/km</span>
                  </span>
                )}
              </li>
            );
          }
          const e = workout.exercises[ex++];
          if (!e) return null;
          return (
            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 text-slate-800">{e.name} <span className="text-slate-500">· {fmtSetsReps(e)}</span></span>
              <span className="shrink-0 text-slate-600">{fmtLoad(e)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
