import { CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Lock, Play, Plus, XCircle } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { planKey, type DraftForm, type Workout, type WorkoutType } from '../data/types';
import { simLabel } from '../data/stations';
import { runs, sessionLoad } from '../lib/analytics';
import { addDays, diffDays, fmtShort, startOfWeek, WEEKDAYS, WEEKDAYS_SHORT } from '../lib/dates';
import { fmtDuration } from '../lib/format';
import { TYPE_COLORS, TYPE_DESCRIPTIONS, WORKOUT_TYPES } from '../lib/theme';
import { Card, CardHeader, Modal, TypeBadge } from './ui';
import { WorkoutDetail } from './WorkoutDetail';

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

function DayModal({ date, workouts, onClose }: { date: string; workouts: Workout[]; onClose: () => void }) {
  const { plan, setDayPlan, today, readOnly, planDetails, drafts, removeWorkout } = useData();
  const { openAddWorkout, openPlanEditor, startPlannedWorkout, openEditWorkout } = useUI();
  const planned = plan[date] ?? [];
  // Every day can be changed, so past training can be filled in later.
  const editable = !readOnly;
  const past = date < today;
  const toggle = (t: WorkoutType) => setDayPlan(date, planned.includes(t) ? planned.filter((x) => x !== t) : WORKOUT_TYPES.filter((x) => x === t || planned.includes(x)));
  const weekday = WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];

  return (
    <Modal open onClose={onClose} title={`${weekday} · ${fmtShort(date)}`} wide={workouts.length > 0}>
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">Plan</h4>
            {editable ? (
              planned.length > 0 && <button className="text-xs font-medium text-slate-500 hover:text-rose-600" onClick={() => setDayPlan(date, [])}>Clear</button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500"><Lock size={11} /> View only</span>
            )}
          </div>
          {editable ? (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {WORKOUT_TYPES.map((t) => {
                const on = planned.includes(t);
                return (
                  <li key={t}>
                    <button onClick={() => toggle(t)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${on ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'}`}>{on && <Check size={13} />}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                          <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[t] }} />
                          {t}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">{TYPE_DESCRIPTIONS[t]}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : planned.length ? (
            <div className="flex flex-wrap gap-1.5">{planned.map((t) => <TypeBadge key={t} type={t} />)}</div>
          ) : (
            <p className="text-sm text-slate-500">Nothing was planned for this day.</p>
          )}
          {editable && <p className="mt-2 text-[11px] text-slate-500">Changes save straight away. Pick more than one for double sessions.</p>}

          {editable && planned.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-semibold text-slate-800">Plan the exercises</h4>
              {planned.map((t) => {
                const key = planKey(date, t);
                const detail = planDetails[key];
                const started = drafts.some((d) => d.fromPlan === key);
                const done = workouts.some((w) => w.type === t && !w.fromPlan);
                const counted = workouts.some((w) => w.type === t && w.fromPlan);
                return (
                  <div key={t} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
                    <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[t] }} />
                    <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                      {t}
                      <span className="block text-xs font-normal text-slate-500">{detail ? planSummary(detail) + ' planned' : 'No exercises planned yet'}</span>
                    </span>
                    <button className="btn-ghost py-1.5 text-xs" onClick={() => { onClose(); openPlanEditor(date, t); }}>
                      <ClipboardList size={14} /> {detail ? 'Edit plan' : 'Plan exercises'}
                    </button>
                    {date <= today && !done && !started && (
                      <button className="btn-primary py-1.5 text-xs" onClick={() => { onClose(); startPlannedWorkout(date, t); }}>
                        <Play size={14} /> {past ? 'Log this workout' : 'Start workout'}
                      </button>
                    )}
                    {started && <span className="text-xs font-medium text-blue-700">In progress</span>}
                    {done && date <= today && <span className="text-xs font-medium text-emerald-700">{past ? 'Done' : 'Done today'}</span>}
                    {counted && <span className="basis-full text-[11px] text-emerald-700">Counted as done from your plan. Log it to add the details.</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">Logged workouts</h4>
          {workouts.length === 0 ? (
            <p className="text-sm text-slate-500">{date > today ? 'This day is still ahead.' : date === today ? 'Nothing logged yet today.' : 'No workout was logged on this day.'}</p>
          ) : (
            <div className="space-y-6">
              {workouts.map((w) => (
                <WorkoutDetail key={w.id} workout={w} onEdit={readOnly ? undefined : () => { onClose(); openEditWorkout(w); }} onRemove={readOnly ? undefined : () => window.confirm(`Delete ${w.title}?`) && removeWorkout(w.id)} />
              ))}
            </div>
          )}
          {date <= today && !readOnly && (
            <button className="btn-primary mt-3" onClick={() => { onClose(); openAddWorkout(undefined, date); }}>
              <Plus size={15} /> {past ? 'Add a past workout' : 'Log a workout'}
            </button>
          )}
        </section>
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
