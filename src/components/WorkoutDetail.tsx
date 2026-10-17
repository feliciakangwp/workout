import { Clock, Flame, Gauge, HeartPulse, Route, Trash2 } from 'lucide-react';
import { EXERCISE_BY_NAME } from '../data/exercises';
import { MUSCLE_BY_ID } from '../data/muscles';
import { STATION_BY_ID } from '../data/stations';
import type { ExerciseEntry, Workout } from '../data/types';
import { sessionLoad, workoutMuscles } from '../lib/analytics';
import { fmtLong } from '../lib/dates';
import { fmtDuration, fmtPace, fmtTime } from '../lib/format';
import { DemoBadge, MiniStat, TypeBadge } from './ui';

export const fmtSetsReps = (e: ExerciseEntry) => {
  const unit = EXERCISE_BY_NAME[e.name]?.repUnit === 'm' ? ' m' : '';
  if (e.name === 'Plank') return `${e.sets} × 45 s`;
  return `${e.sets} × ${e.reps}${unit}`;
};

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

export function WorkoutDetail({ workout, onRemove }: { workout: Workout; onRemove?: () => void }) {
  const muscles = workoutMuscles(workout);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={workout.type} />
        <span className="text-sm text-slate-500">{fmtLong(workout.date)}</span>
        {workout.isSample ? <DemoBadge text="Sample workout" /> : <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">Added this session</span>}
      </div>
      <h3 className="-mt-2 text-lg font-semibold text-slate-900">{workout.title}</h3>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MiniStat label="Duration" value={<span className="inline-flex items-center gap-1.5"><Clock size={14} className="text-slate-400" />{fmtDuration(workout.durationMin)}</span>} />
        <MiniStat label="Intensity (RPE)" value={<IntensityBar value={workout.intensity} />} />
        <MiniStat label="Training load" value={<span className="inline-flex items-center gap-1.5"><Flame size={14} className="text-slate-400" />{sessionLoad(workout)}</span>} sub="duration × RPE" />
      </div>

      {workout.run && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Running · {workout.run.kind}</h4>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Distance" value={<span className="inline-flex items-center gap-1.5"><Route size={14} className="text-slate-400" />{workout.run.distanceKm} km</span>} />
            <MiniStat label="Avg pace" value={<span className="inline-flex items-center gap-1.5"><Gauge size={14} className="text-slate-400" />{fmtPace(workout.run.paceSecPerKm)}/km</span>} />
            <MiniStat label="Avg HR" value={<span className="inline-flex items-center gap-1.5"><HeartPulse size={14} className="text-slate-400" />{workout.run.avgHr} bpm</span>} />
          </div>
        </div>
      )}

      {workout.exercises.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Exercises</h4>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Exercise</th>
                  <th className="px-3 py-2 font-medium">Sets × reps</th>
                  <th className="px-3 py-2 text-right font-medium">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workout.exercises.map((e, i) => (
                  <tr key={`${e.name}-${i}`}>
                    <td className="px-3 py-2 text-slate-800">{e.name}</td>
                    <td className="px-3 py-2 text-slate-600">{fmtSetsReps(e)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{e.weightKg ? `${e.weightKg} kg` : 'BW'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {workout.stations && workout.stations.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">HYROX station times</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {workout.stations.map((s) => (
              <MiniStat key={s.station} label={STATION_BY_ID[s.station].name} value={fmtTime(s.timeSec)} sub={STATION_BY_ID[s.station].spec} />
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

      {onRemove && !workout.isSample && (
        <button onClick={onRemove} className="btn-ghost text-rose-600 hover:bg-rose-50">
          <Trash2 size={15} /> Remove this workout
        </button>
      )}
    </div>
  );
}
