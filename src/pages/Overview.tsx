import { Activity, CalendarDays, Clock, Dumbbell, Footprints, HeartPulse, Lightbulb, Pencil, Sparkles, Target, TrendingUp, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, ReferenceLine, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PageId } from '../components/Layout';
import { Card, CardHeader, ChartTooltip, DemoBadge, Modal, PageHeader, RANGE_OPTIONS, Segmented, StatCard } from '../components/ui';
import { WeeklyPlanner } from '../components/WeeklyPlanner';
import { useUI } from '../context/UIContext';
import { useData } from '../context/DataContext';
import type { Goals } from '../data/types';
import { type RangeKey, trainingInsights, trainingTrends, weekComparison, best5kPace, runs, predictTime, raceTypeLabel, upcomingRaces } from '../lib/analytics';
import { diffDays, fmtShort } from '../lib/dates';
import { fmtDuration, fmtPace, fmtPct, fmtTime, parseTime, pctChange } from '../lib/format';
import { AXIS, GRID, SERIES } from '../lib/theme';

export function Overview({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const { workouts, recovery, today } = useData();
  const cmp = useMemo(() => weekComparison(workouts, recovery, today), [workouts, recovery, today]);
  const { current: c, previous: p } = cmp;
  const vs = `vs ${cmp.daysElapsed === 7 ? 'last week' : 'same point last week'}`;

  return (
    <div>
      <PageHeader title="Training Overview" subtitle={`This week so far (${cmp.daysElapsed} of 7 days) compared with the same days last week.`} actions={<DemoBadge />} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={CalendarDays} label="Workouts this week" value={String(c.workouts)} unit={`/ ${cmp.daysElapsed} days`} delta={c.workouts - p.workouts} deltaLabel={`${c.workouts - p.workouts >= 0 ? '+' : ''}${c.workouts - p.workouts}`} comparison={`${p.workouts} ${vs}`} />
        <StatCard icon={Clock} label="Training duration" value={fmtDuration(c.minutes)} delta={c.minutes - p.minutes} deltaLabel={fmtPct(pctChange(c.minutes, p.minutes))} comparison={`${fmtDuration(p.minutes)} ${vs}`} accent="sky" />
        <StatCard icon={Footprints} label="Running distance" value={c.runKm.toFixed(1)} unit="km" delta={c.runKm - p.runKm} deltaLabel={fmtPct(pctChange(c.runKm, p.runKm))} comparison={`${p.runKm.toFixed(1)} km ${vs}`} accent="violet" />
        <StatCard icon={Dumbbell} label="Strength index" value={c.strengthIndex.toFixed(1)} unit="pts" delta={c.strengthIndex - p.strengthIndex} deltaLabel={`${c.strengthIndex - p.strengthIndex >= 0 ? '+' : ''}${(c.strengthIndex - p.strengthIndex).toFixed(1)}`} comparison={`${p.strengthIndex.toFixed(1)} last week · 100 = block start`} accent="amber" />
        <StatCard icon={Activity} label="Muscle coverage" value={`${c.musclesOnTarget}/10`} unit="on target" delta={c.musclesOnTarget - p.musclesOnTarget} deltaLabel={`${c.musclesOnTarget - p.musclesOnTarget >= 0 ? '+' : ''}${c.musclesOnTarget - p.musclesOnTarget}`} comparison={`${p.musclesOnTarget}/10 last week (rolling 7 days)`} accent="emerald" />
        <StatCard icon={HeartPulse} label="Recovery status" value={String(c.recoveryScore)} unit={cmp.recoveryLabel} delta={c.recoveryScore - p.recoveryScore} deltaLabel={`${c.recoveryScore - p.recoveryScore >= 0 ? '+' : ''}${c.recoveryScore - p.recoveryScore}`} comparison={`${p.recoveryScore} this day last week`} accent="rose" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <WeeklyPlanner className="xl:col-span-2" />
        <GoalsCard />
      </div>

      <TrainingTrends />

      <Insights onNavigate={onNavigate} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function GoalsCard() {
  const { goals, updateGoals, workouts, today, readOnly } = useData();
  const { openProfile } = useUI();
  const races = upcomingRaces(goals, today);
  const [editing, setEditing] = useState(false);
  const best = best5kPace(runs(workouts));
  const predicted10k = best ? predictTime(best * 5, 5, goals.runGoalDistanceKm) : 0;
  const goalTime = goals.runGoalPaceSecPerKm * goals.runGoalDistanceKm;
  const startWeight = Math.max(goals.currentWeightKg, 65);
  const weightPct = Math.min(100, Math.max(0, ((startWeight - goals.currentWeightKg) / (startWeight - goals.targetWeightKg || 1)) * 100));
  const runPct = predicted10k ? Math.min(100, (goalTime / predicted10k) * 100) : 0;

  return (
    <Card>
      <CardHeader icon={Target} title="Goals & races" subtitle="Editable example goals — not measured values" action={!readOnly && <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</button>} />
      <div className="space-y-4 p-5">
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">Body weight</span>
            <span className="text-slate-500"><b className="font-semibold text-slate-900">{goals.currentWeightKg} kg</b> → {goals.targetWeightKg} kg</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${weightPct}%` }} /></div>
          <p className="mt-1 text-xs text-slate-500">{(goals.currentWeightKg - goals.targetWeightKg).toFixed(1)} kg to go · fat loss while maintaining muscle</p>
        </div>
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">{goals.runGoalDistanceKm} km @ {fmtPace(goals.runGoalPaceSecPerKm)}/km</span>
            <span className="text-slate-500">target {fmtTime(goalTime)}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${runPct}%` }} /></div>
          <p className="mt-1 text-xs text-slate-500">{predicted10k ? `Predicted from best 5 km+ pace: ${fmtTime(predicted10k)} (${fmtPace(predicted10k / goals.runGoalDistanceKm)}/km)` : 'Log a 5 km run to see a prediction'}</p>
        </div>
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upcoming races · {goals.athleteSex === 'female' ? 'Female' : 'Male'}</p>
            {!readOnly && <button className="text-xs font-medium text-blue-600 hover:text-blue-700" onClick={openProfile}>Manage races →</button>}
          </div>
          {races.length === 0 && <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">No upcoming race planned.</p>}
          {races.map((race) => {
            const days = diffDays(race.date, today);
            return (
              <button key={race.id} onClick={openProfile} className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left hover:bg-blue-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{race.name}</p>
                  <p className="truncate text-xs text-slate-500">{raceTypeLabel(race, goals.athleteSex)} · {fmtShort(race.date)} {race.date.slice(0, 4)}</p>
                </div>
                <span className="text-right">
                  <span className="block text-lg font-semibold leading-none text-blue-700">{days >= 0 ? days : '—'}</span>
                  <span className="text-[11px] text-slate-500">{days >= 0 ? 'days to go' : 'completed'}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {editing && <GoalsEditor goals={goals} onClose={() => setEditing(false)} onSave={(g) => { updateGoals(g); setEditing(false); }} />}
    </Card>
  );
}

function GoalsEditor({ goals, onClose, onSave }: { goals: Goals; onClose: () => void; onSave: (g: Goals) => void }) {
  const [draft, setDraft] = useState({
    current: String(goals.currentWeightKg),
    target: String(goals.targetWeightKg),
    km: String(goals.runGoalDistanceKm),
    pace: fmtPace(goals.runGoalPaceSecPerKm),
    sessions: String(goals.weeklySessionsTarget),
    runKm: String(goals.weeklyRunKmTarget),
  });
  const [error, setError] = useState('');
  const save = () => {
    const pace = parseTime(draft.pace);
    const nums = [draft.current, draft.target, draft.km, draft.sessions, draft.runKm].map(Number);
    if (nums.some((n) => !(n > 0)) || !(pace > 120 && pace < 900)) return setError('Enter positive numbers and a pace as m:ss.');
    onSave({ ...goals, currentWeightKg: nums[0], targetWeightKg: nums[1], runGoalDistanceKm: nums[2], runGoalPaceSecPerKm: pace, weeklySessionsTarget: nums[3], weeklyRunKmTarget: nums[4] });
  };
  const field = (key: keyof typeof draft, label: string, type = 'number') => (
    <div>
      <label className="label" htmlFor={`g-${key}`}>{label}</label>
      <input id={`g-${key}`} type={type} step="0.1" className="input" value={draft[key] as string} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
    </div>
  );
  return (
    <Modal open onClose={onClose} title="Edit goals" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save goals</button></>}>
      {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        {field('current', 'Current weight (kg)')}
        {field('target', 'Target weight (kg)')}
        {field('km', 'Run goal distance (km)')}
        {field('pace', 'Run goal pace (m:ss /km)', 'text')}
        {field('sessions', 'Weekly sessions target')}
        {field('runKm', 'Weekly running target (km)')}
      </div>
      <p className="mt-4 text-xs text-slate-500">Races are managed under Athlete &amp; races.</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function TrainingTrends() {
  const { workouts, today, goals } = useData();
  const [range, setRange] = useState<RangeKey>('30d');
  const data = useMemo(() => trainingTrends(workouts, range, today), [workouts, range, today]);
  const weekly = range === '90d';
  const fmtLabel = (l: string | number) => (weekly ? `Week of ${fmtShort(String(l))}` : fmtShort(String(l)));
  const tickFmt = (l: string) => fmtShort(l);
  const totalMin = data.reduce((a, d) => a + d.minutes, 0);
  const totalKm = data.reduce((a, d) => a + d.runKm, 0);
  const completed = data.reduce((a, d) => a + d.completed, 0);
  const planned = data.reduce((a, d) => a + d.planned, 0);
  const si = data.filter((d) => d.strengthIndex !== null);
  const siChange = si.length > 1 ? si[si.length - 1].strengthIndex! - si[0].strengthIndex! : 0;
  const interval = range === '30d' ? 4 : 0;

  const chart = (title: string, summary: string, body: JSX.Element) => (
    <div className="rounded-xl border border-slate-100 p-3 sm:p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <span className="text-xs text-slate-500">{summary}</span>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">{body}</ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <Card className="mt-5">
      <CardHeader icon={TrendingUp} title="Training trends" subtitle={weekly ? 'Weekly totals' : 'Daily values'} action={<Segmented value={range} onChange={setRange} options={RANGE_OPTIONS} />} />
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-2">
        {chart('Training duration', `${fmtDuration(totalMin)} total`,
          <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" tickFormatter={tickFmt} {...AXIS} interval={interval} minTickGap={8} />
            <YAxis {...AXIS} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip labelFormatter={fmtLabel} valueFormatter={(v) => fmtDuration(Number(v))} />} />
            <Bar dataKey="minutes" name="Duration" fill={SERIES.blue} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>,
        )}
        {chart('Strength index', `${siChange >= 0 ? '+' : ''}${siChange.toFixed(1)} pts in period`,
          <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" tickFormatter={tickFmt} {...AXIS} interval={interval} minTickGap={8} />
            <YAxis {...AXIS} domain={['dataMin - 2', 'dataMax + 2']} tickFormatter={(v) => Math.round(v).toString()} />
            <Tooltip content={<ChartTooltip labelFormatter={fmtLabel} valueFormatter={(v) => `${Number(v).toFixed(1)} pts`} />} />
            <Line type="stepAfter" dataKey="strengthIndex" name="Strength index" stroke={SERIES.orange} strokeWidth={2} dot={weekly ? { r: 3 } : false} activeDot={{ r: 5 }} connectNulls />
          </LineChart>,
        )}
        {chart('Running distance', `${totalKm.toFixed(1)} km total${weekly ? ` · target ${goals.weeklyRunKmTarget} km/wk` : ''}`,
          <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" tickFormatter={tickFmt} {...AXIS} interval={interval} minTickGap={8} />
            <YAxis {...AXIS} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip labelFormatter={fmtLabel} valueFormatter={(v) => `${Number(v).toFixed(1)} km`} />} />
            {weekly && <ReferenceLine y={goals.weeklyRunKmTarget} stroke="#64748b" strokeDasharray="4 4" />}
            <Bar dataKey="runKm" name="Distance" fill={SERIES.violet} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>,
        )}
        {chart('Workout consistency', `${completed}/${planned} days trained (${Math.round((completed / planned) * 100)}%)`,
          weekly ? (
            <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" tickFormatter={tickFmt} {...AXIS} />
              <YAxis {...AXIS} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip labelFormatter={fmtLabel} valueFormatter={(v) => `${v}%`} />} />
              <Bar dataKey="adherence" name="Adherence" fill={SERIES.aqua} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          ) : (
            <BarChart data={data.map((d) => ({ ...d, missed: d.planned - d.completed }))} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" tickFormatter={tickFmt} {...AXIS} interval={interval} minTickGap={8} />
              <YAxis hide domain={[0, 1]} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip labelFormatter={fmtLabel} valueFormatter={(v) => (v ? 'Yes' : 'No')} />} />
              <Bar dataKey="completed" name="Trained" stackId="a" fill={SERIES.aqua} maxBarSize={28} />
              <Bar dataKey="missed" name="Rest" stackId="a" fill="#e2e8f0" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          ),
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function Insights({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const { workouts, recovery, today } = useData();
  const insights = useMemo(() => trainingInsights(workouts, recovery, today), [workouts, recovery, today]);
  const meta = {
    improving: { icon: Sparkles, tone: 'text-emerald-600 bg-emerald-50', link: 'strength' as PageId, linkLabel: 'View strength' },
    attention: { icon: TriangleAlert, tone: 'text-amber-600 bg-amber-50', link: 'muscles' as PageId, linkLabel: 'View muscle analysis' },
    focus: { icon: Lightbulb, tone: 'text-blue-600 bg-blue-50', link: 'recovery' as PageId, linkLabel: 'View recovery' },
  };
  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900">Training insights</h2>
        <DemoBadge text="Prototype insights · rule-based on demo data" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {insights.map((ins) => {
          const m = meta[ins.kind];
          const Icon = m.icon;
          return (
            <Card key={ins.kind} className="flex flex-col p-5">
              <div className="flex items-center gap-2.5">
                <span className={`rounded-xl p-2 ${m.tone}`}><Icon size={18} /></span>
                <h3 className="text-sm font-semibold text-slate-900">{ins.title}</h3>
              </div>
              <ul className="mt-3 flex-1 space-y-2">
                {ins.points.map((pt) => (
                  <li key={pt} className="flex gap-2 text-sm text-slate-600">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    {pt}
                  </li>
                ))}
              </ul>
              <button onClick={() => onNavigate(m.link)} className="mt-4 self-start text-xs font-medium text-blue-600 hover:text-blue-700">
                {m.linkLabel} →
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
