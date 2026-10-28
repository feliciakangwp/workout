import { CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Eye, Lock, Pencil, Play, Plus, Trash2, XCircle } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { planKey, type DraftForm, type Workout, type WorkoutType } from '../data/types';
import { simLabel } from '../data/stations';
import { runs, sessionLoad } from '../lib/analytics';
import { addDays, diffDays, fmtShort, startOfWeek, WEEKDAYS, WEEKDAYS_SHORT } from '../lib/dates';
import { fmtDuration, fmtTime } from '../lib/format';
import { fromPlanForm } from '../lib/planWorkouts';
import { TYPE_COLORS, TYPE_DESCRIPTIONS, WORKOUT_TYPES } from '../lib/theme';
import { Card, CardHeader, Modal, TypeBadge } from './ui';
import { WorkoutDetail, fmtLoad, fmtSetsReps } from './WorkoutDetail';

/** Short description of a planned workout's contents, e.g. "5 exercises". */
export function planSummary(f: DraftForm) {
  if (f.type === 'HYROX') return simLabel(f.sim);
  if (f.type === 'Running') {
    const n = f.runRows.filter((r) => r.km.trim()).length;
    return `${n} run${n === 1 ? '' : 's'}`;
  }
  const n = f.rows.filter((r) => r.name).length;
  return `${n} exercise${n === 1 ? '' : 's'}`;
}

/** How far ahead the athlete can plan. */
const WEEKS_AHEAD = 4;

/**
 * Weekly calendar the athlete plans themselves. Every day is editable:
 * plan ahead, or fill in workouts on past days.
 */
export function WeeklyPlanner({ className = '' }: { className?: string }) {
  const { workouts, today, plan, readOnly, planDetails } = useData();
  const thisWeek = startOfWeek(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [selected, setSelected] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDate = useMemo(() => {
    const m = new Map<string, Workout[]>();
    workouts.forEach((w) => m.set(w.date, [...(m.get(w.date) ?? []), w]));
    return m;
  }, [workouts]);

  // Go back up to a year to fill in past training.
  const minWeek = addDays(thisWeek, -7 * 52);
  const maxWeek = addDays(thisWeek, 7 * WEEKS_AHEAD);
  const canPrev = weekStart > minWeek;
  const canNext = weekStart < maxWeek;
  const go = (dir: -1 | 1) => setWeekStart((w) => (dir < 0 ? (w > minWeek ? addDays(w, -7) : w) : w < maxWeek ? addDays(w, 7) : w));
  const offset = diffDays(weekStart, thisWeek) / 7;
  const weekName = offset === 0 ? 'This week' : offset === -1 ? 'Last week' : offset === 1 ? 'Next week' : offset < 0 ? `${-offset} weeks ago` : `In ${offset} weeks`;

  // Swipe right → previous week, swipe left → next week.
  const onTouchStart = (e: React.TouchEvent) => (touchX.current = e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 60) go(dx > 0 ? -1 : 1);
  };

  return (
    <Card className={className}>
      <CardHeader
        icon={CalendarDays}
        title="Weekly training plan"
        subtitle={`${weekName} · ${fmtShort(weekStart)} – ${fmtShort(addDays(weekStart, 6))}`}
        action={
          <div className="flex items-center gap-1">
            <button className="btn-ghost px-2 py-1.5" disabled={!canPrev} onClick={() => go(-1)} aria-label="Previous week"><ChevronLeft size={16} /></button>
            <button className="btn-ghost px-2.5 py-1.5 text-xs" disabled={offset === 0} onClick={() => setWeekStart(thisWeek)}>This week</button>
            <button className="btn-ghost px-2 py-1.5" disabled={!canNext} onClick={() => go(1)} aria-label="Next week"><ChevronRight size={16} /></button>
          </div>
        }
      />
      <p className="px-4 pt-1 text-[11px] text-slate-500 sm:px-5">
        {readOnly ? 'View only.' : 'Tap a day to plan it or log a workout, including past days.'} <span className="sm:hidden">Swipe right for last week, left for next week.</span>
      </p>
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="grid grid-cols-1 gap-1.5 p-4 sm:grid-cols-4 sm:gap-2 sm:p-5 lg:grid-cols-7 xl:grid-cols-4 2xl:grid-cols-7">
        {days.map((d, i) => {
          const planned = plan[d] ?? [];
          const done = byDate.get(d) ?? [];
          const past = d < today;
          const isToday = d === today;
          // A planned Recovery day without exercises is a rest day, not a missed workout.
          const status = done.length ? 'done' : past ? (planned.some((t) => t !== 'Recovery') ? 'missed' : 'rest') : planned.length ? 'planned' : 'empty';
          return (
            <button
              key={d}
              onClick={() => setSelected(d)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition hover:shadow-md sm:min-h-[150px] sm:flex-col sm:items-stretch sm:gap-0 ${
                isToday ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'
              } ${past ? 'bg-slate-50' : 'bg-white'}`}
            >
              <div className="w-12 shrink-0 sm:flex sm:w-full sm:items-center sm:justify-between">
                <span className={`block text-xs font-semibold ${isToday ? 'text-blue-600' : 'text-slate-500'}`}>{WEEKDAYS_SHORT[i]}</span>
                <span className={`block text-[11px] ${isToday ? 'font-semibold text-blue-600' : 'text-slate-400'}`}>
                  {isToday ? 'Today' : fmtShort(d)}
                </span>
              </div>
              <div className="min-w-0 flex-1 sm:mt-2">
                {planned.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {planned.map((t) => {
                      const detail = planDetails[planKey(d, t)];
                      return (
                        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_COLORS[t] }} />
                          {t}
                          {detail && <span className="font-normal text-slate-500">· {planSummary(detail)}</span>}
                        </span>
                      );
                    })}
                  </div>
                )}
                {done.map((w) => (
                  <p key={w.id} className="mt-1 truncate text-xs text-slate-600">
                    <CheckCircle2 size={11} className="mr-1 inline -translate-y-px text-emerald-600" />
                    {w.title.replace(/ — .*/, '')} · {fmtDuration(w.durationMin)}
                  </p>
                ))}
                {status === 'empty' && <p className="text-xs text-slate-400 sm:mt-1">Nothing planned</p>}
                {status === 'rest' && <p className="text-xs text-slate-400 sm:mt-1">Rest day</p>}
              </div>
              <span className="shrink-0 text-[11px] font-medium sm:mt-auto sm:pt-2">
                {status === 'done' && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={12} /> Done</span>}
                {status === 'missed' && <span className="inline-flex items-center gap-1 text-slate-500"><XCircle size={12} /> Missed</span>}
                {status === 'planned' && <span className="inline-flex items-center gap-1 text-blue-600"><Check size={12} /> Planned</span>}
                {status === 'empty' && !readOnly && <span className="inline-flex items-center gap-1 text-blue-600"><Plus size={12} /> Plan</span>}
              </span>
            </button>
          );
        })}
      </div>

      <WeekSummary days={days} byDate={byDate} />

      {selected && <DayModal date={selected} workouts={byDate.get(selected) ?? []} onClose={() => setSelected(null)} />}
    </Card>
  );
}

/** What the day window shows: the day itself, a planned workout, or a logged one. */
type DayView = { kind: 'day' } | { kind: 'plan'; type: WorkoutType } | { kind: 'workout'; id: string };

function DayModal({ date, workouts, onClose }: { date: string; workouts: Workout[]; onClose: () => void }) {
  const { plan, setDayPlan, today, readOnly, planDetails, drafts } = useData();
  const { openAddWorkout } = useUI();
  const [view, setView] = useState<DayView>({ kind: 'day' });
  const planned = plan[date] ?? [];
  // Every day can be changed, so past training can be filled in later.
  const editable = !readOnly;
  const past = date < today;
  const toggle = (t: WorkoutType) => setDayPlan(date, planned.includes(t) ? planned.filter((x) => x !== t) : WORKOUT_TYPES.filter((x) => x === t || planned.includes(x)));
  const weekday = WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
  const logged = workouts.filter((w) => !w.fromPlan);
  // Logged workouts that weren't planned for the day.
  const unplanned = logged.filter((w) => !planned.includes(w.type));
  const title = `${weekday} · ${fmtShort(date)}`;

  if (view.kind === 'workout') {
    const w = logged.find((x) => x.id === view.id);
    if (w) return <LoggedWorkoutView workout={w} title={title} onBack={() => setView({ kind: 'day' })} onClose={onClose} />;
  }
  if (view.kind === 'plan') return <PlanView date={date} type={view.type} title={title} onBack={() => setView({ kind: 'day' })} onClose={onClose} />;

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-5">
        {(planned.length > 0 || logged.length > 0) && (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-800">Workouts</h4>
            {planned.map((t) => {
              const key = planKey(date, t);
              const detail = planDetails[key];
              const started = drafts.some((d) => d.fromPlan === key);
              const done = logged.find((w) => w.type === t);
              const counted = workouts.some((w) => w.type === t && w.fromPlan);
              return (
                <div key={t} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
                  <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[t] }} />
                  <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                    {done ? done.title : t}
                    <span className="block text-xs font-normal text-slate-500">
                      {done ? `${fmtDuration(done.durationMin)} · ${loggedSummary(done)}` : detail ? planSummary(detail) + ' planned' : 'No exercises planned yet'}
                    </span>
                  </span>
                  {done ? (
                    <>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} /> Done</span>
                      <button className="btn-ghost py-1.5 text-xs" onClick={() => setView({ kind: 'workout', id: done.id })}>
                        <Eye size={14} /> View workout
                      </button>
                    </>
                  ) : (
                    <>
                      {started && <span className="text-xs font-medium text-blue-700">In progress</span>}
                      {detail || readOnly ? (
                        <button className="btn-ghost py-1.5 text-xs" onClick={() => setView({ kind: 'plan', type: t })}>
                          <Eye size={14} /> View plan
                        </button>
                      ) : (
                        <PlanButton date={date} type={t} onClose={onClose} />
                      )}
                      {editable && date <= today && !started && <StartButton date={date} type={t} label={past ? 'Log this workout' : 'Start workout'} onClose={onClose} />}
                    </>
                  )}
                  {counted && !done && <span className="basis-full text-[11px] text-emerald-700">Counted as done from your plan. Log it to add the details.</span>}
                </div>
              );
            })}
            {unplanned.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
                <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[w.type] }} />
                <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                  {w.title}
                  <span className="block text-xs font-normal text-slate-500">{w.type} · {fmtDuration(w.durationMin)} · {loggedSummary(w)}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} /> Done</span>
                <button className="btn-ghost py-1.5 text-xs" onClick={() => setView({ kind: 'workout', id: w.id })}>
                  <Eye size={14} /> View workout
                </button>
              </div>
            ))}
          </section>
        )}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">{planned.length ? 'Plan' : 'Plan this day'}</h4>
            {editable ? (
              planned.length > 0 && <button className="text-xs font-medium text-slate-500 hover:text-rose-600" onClick={() => setDayPlan(date, [])}>Clear</button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500"><Lock size={11} /> View only</span>
            )}
          </div>
          {editable ? (
            <div className="flex flex-wrap gap-1.5">
              {WORKOUT_TYPES.map((t) => {
                const on = planned.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggle(t)}
                    title={TYPE_DESCRIPTIONS[t]}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'}`}
                  >
                    {on ? <Check size={14} /> : <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[t] }} />}
                    {t}
                  </button>
                );
              })}
            </div>
          ) : planned.length ? (
            <div className="flex flex-wrap gap-1.5">{planned.map((t) => <TypeBadge key={t} type={t} />)}</div>
          ) : (
            <p className="text-sm text-slate-500">Nothing was planned for this day.</p>
          )}
          {editable && <p className="mt-2 text-[11px] text-slate-500">Tap to add or remove. Changes save straight away; pick more than one for double sessions.</p>}
        </section>


        {date > today && !planned.length && <p className="text-sm text-slate-500">This day is still ahead.</p>}
        {date <= today && !readOnly && (
          <button className="btn-primary" onClick={() => { onClose(); openAddWorkout(undefined, date); }}>
            <Plus size={15} /> {past ? 'Add a past workout' : 'Log a workout'}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** "5 exercises", "6.2 km", or both for HYROX Engine. */
function loggedSummary(w: Workout) {
  const parts = [w.exercises.length && !w.hyrox ? `${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'}` : '', w.run ? `${w.run.distanceKm} km` : '', w.hyrox ? simLabel(w.hyrox.sim) : ''].filter(Boolean);
  return parts.join(' · ') || 'logged';
}

function PlanButton({ date, type, onClose }: { date: string; type: WorkoutType; onClose: () => void }) {
  const { openPlanEditor } = useUI();
  return (
    <button className="btn-ghost py-1.5 text-xs" onClick={() => { onClose(); openPlanEditor(date, type); }}>
      <ClipboardList size={14} /> Plan exercises
    </button>
  );
}

function StartButton({ date, type, label, onClose }: { date: string; type: WorkoutType; label: string; onClose: () => void }) {
  const { startPlannedWorkout } = useUI();
  return (
    <button className="btn-primary py-1.5 text-xs" onClick={() => { onClose(); startPlannedWorkout(date, type); }}>
      <Play size={14} /> {label}
    </button>
  );
}

/** A logged workout from the day: its details, with Edit and Remove. */
function LoggedWorkoutView({ workout, title, onBack, onClose }: { workout: Workout; title: string; onBack: () => void; onClose: () => void }) {
  const { readOnly, removeWorkout } = useData();
  const { openEditWorkout } = useUI();
  return (
    <Modal open onClose={onClose} title={title} wide>
      <button className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700" onClick={onBack}>
        <ChevronLeft size={14} /> Back to the day
      </button>
      <WorkoutDetail
        workout={workout}
        onEdit={readOnly ? undefined : () => { onClose(); openEditWorkout(workout); }}
        onRemove={readOnly ? undefined : () => { if (window.confirm(`Delete ${workout.title}?`)) { removeWorkout(workout.id); onBack(); } }}
      />
    </Modal>
  );
}

/** A planned workout: the exercises and runs planned, with Edit plan, Start and Remove from plan. */
function PlanView({ date, type, title, onBack, onClose }: { date: string; type: WorkoutType; title: string; onBack: () => void; onClose: () => void }) {
  const { plan, setDayPlan, planDetails, customExercises, today, readOnly, drafts } = useData();
  const { openPlanEditor } = useUI();
  const key = planKey(date, type);
  const form = planDetails[key];
  const { exercises, run } = fromPlanForm(form, customExercises);
  const started = drafts.some((d) => d.fromPlan === key);
  const remove = () => {
    if (!window.confirm(`Remove ${type} from ${fmtShort(date)}'s plan?`)) return;
    setDayPlan(date, (plan[date] ?? []).filter((t) => t !== type));
    onBack();
  };
  return (
    <Modal open onClose={onClose} title={title}>
      <button className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700" onClick={onBack}>
        <ChevronLeft size={14} /> Back to the day
      </button>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={type} />
          <span className="text-xs font-medium text-violet-700">Planned</span>
          {form?.title.trim() && <span className="text-sm font-semibold text-slate-900">{form.title}</span>}
          {form?.duration && <span className="text-xs text-slate-500">· {form.duration} min</span>}
        </div>
        {type === 'HYROX' && form ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{simLabel(form.sim)} planned.</p>
        ) : exercises.length || run ? (
          <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-sm">
            {exercises.map((e, i) => (
              <li key={`${e.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 shrink-0 text-xs text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1 font-medium text-slate-800">{e.name}</span>
                <span className="shrink-0 text-xs text-slate-600">{fmtSetsReps(e)}</span>
                <span className="w-16 shrink-0 text-right text-xs text-slate-500">{fmtLoad(e)}</span>
              </li>
            ))}
            {(run?.segments ?? []).map((sg, i) => (
              <li key={`run-${i}`} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 shrink-0 text-xs text-slate-400">R{i + 1}</span>
                <span className="min-w-0 flex-1 font-medium text-slate-800">Run {i + 1}</span>
                <span className="shrink-0 text-xs text-slate-600">{sg.distanceKm} km in {fmtTime(sg.timeSec)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">No exercises planned yet.</p>
        )}
        {started && <p className="text-xs font-medium text-blue-700">This workout is in progress: continue it from the bar at the top.</p>}
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => { onClose(); openPlanEditor(date, type); }}>
              <Pencil size={14} /> Edit plan
            </button>
            {date <= today && !started && <StartButton date={date} type={type} label={date < today ? 'Log this workout' : 'Start workout'} onClose={onClose} />}
            <button className="btn-ghost text-rose-600 hover:bg-rose-50" onClick={remove}>
              <Trash2 size={14} /> Remove from plan
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function WeekSummary({ days, byDate }: { days: string[]; byDate: Map<string, Workout[]> }) {
  const { plan, goals } = useData();
  const workouts = days.flatMap((d) => byDate.get(d) ?? []);
  const plannedCount = days.reduce((a, d) => a + (plan[d]?.length ?? 0), 0);
  const items = [
    { label: 'Planned', value: String(plannedCount), sub: plannedCount ? 'sessions this week' : 'tap a day to plan' },
    { label: 'Completed', value: String(workouts.length), sub: `target ${goals.weeklySessionsTarget} training sessions` },
    { label: 'Total time', value: fmtDuration(workouts.reduce((a, w) => a + w.durationMin, 0)), sub: 'logged' },
    { label: 'Running', value: `${runs(workouts).reduce((a, r) => a + r.distanceKm, 0).toFixed(1)} km`, sub: `target ${goals.weeklyRunKmTarget} km` },
    { label: 'Training load', value: workouts.reduce((a, w) => a + sessionLoad(w), 0).toLocaleString(), sub: 'duration × RPE' },
  ];
  return (
    <div className="mx-4 mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 sm:mx-5 sm:mb-5 sm:grid-cols-5">
      {items.map((i) => (
        <div key={i.label} className="px-1">
          <p className="text-[11px] font-medium text-slate-500">{i.label}</p>
          <p className="text-base font-semibold text-slate-900">{i.value}</p>
          <p className="text-[11px] text-slate-400">{i.sub}</p>
        </div>
      ))}
    </div>
  );
}
