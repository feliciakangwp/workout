import { Activity, BarChart3, CalendarClock, Dumbbell, Repeat, Target, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BodyFigure } from '../components/BodyMap';
import { RaceFocusStrip } from '../components/RacePlan';
import { Card, CardHeader, ChartTooltip, DemoBadge, EmptyState, MiniStat, PageHeader, Segmented } from '../components/ui';
import { useData } from '../context/DataContext';
import { MUSCLES } from '../data/muscles';
import type { MuscleGroup } from '../data/types';
import { COVERAGE_META, type CoverageWindow, muscleCoverage, muscleDetail, relayFocusMuscles } from '../lib/analytics';
import { diffDays, fmtShort } from '../lib/dates';
import { fmtPct } from '../lib/format';
import { AXIS, GRID, SERIES } from '../lib/theme';

export function MuscleAnalysis() {
  const { workouts, today, goals } = useData();
  const [period, setPeriod] = useState<CoverageWindow>('4w');
  const coverage = useMemo(() => muscleCoverage(workouts, period, today), [workouts, period, today]);
  const lowest = [...coverage].sort((a, b) => a.pct - b.pct)[0]?.id ?? 'quadriceps';
  const [selected, setSelected] = useState<MuscleGroup>(lowest);
  const [hovered, setHovered] = useState<MuscleGroup | null>(null);
  const colors = Object.fromEntries(coverage.map((c) => [c.id, COVERAGE_META[c.status].color])) as Record<MuscleGroup, string>;
  const hoveredInfo = coverage.find((c) => c.id === (hovered ?? selected));
  // Relay-only race calendar: emphasise the muscles those legs use until the race has passed.
  const relayFocus = useMemo(() => relayFocusMuscles(goals, today), [goals, today]);
  const counts = coverage.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});

  return (
    <div>
      <PageHeader
        title="Muscle Analysis"
        subtitle="Coverage is calculated from logged sets: primary muscles get 1 set per set performed, secondary muscles 0.5, conditioning efforts half credit."
        actions={
          <>
            <DemoBadge />
            <Segmented value={period} onChange={setPeriod} options={[{ value: '7d', label: 'Last 7 days' }, { value: '4w', label: '4-week average' }]} />
          </>
        }
      />

      <RaceFocusStrip onSelect={setSelected} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader icon={Activity} title="Muscle coverage map" subtitle="Click a muscle group to see its details" />
          <div className="px-5 pt-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
              {(['within', 'below', 'significant', 'nodata'] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: COVERAGE_META[s].color }} />
                  {COVERAGE_META[s].label}
                  <span className="text-slate-400">({counts[s] ?? 0})</span>
                </span>
              ))}
            </div>
            {relayFocus.size > 0 && <p className="mt-1 text-[11px] font-semibold text-blue-800">Bold = relay focus muscles for your upcoming relay.</p>}
            <p className="mt-1 text-[11px] text-slate-400">Within ≥ 80% of weekly set target · Below 50–79% · Significantly below &lt; 50%</p>
          </div>
          <div className="grid grid-cols-2 gap-2 px-3 pt-2 sm:px-8">
            {(['front', 'back'] as const).map((v) => (
              <div key={v} className="flex flex-col items-center">
                <div className="h-[300px] w-full max-w-[170px] sm:h-[400px] sm:max-w-[180px]">
                  <BodyFigure view={v} colors={colors} selected={selected} hovered={hovered} onSelect={setSelected} onHover={setHovered} emphasis={relayFocus} />
                </div>
                <span className="mt-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{v} view</span>
              </div>
            ))}
          </div>
          <div className="mx-5 mt-3 flex h-9 items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-600">
            {hoveredInfo && (
              <span>
                <b className={relayFocus.has(hoveredInfo.id) ? 'font-extrabold text-blue-800' : 'font-semibold text-slate-900'}>{hoveredInfo.label}</b>
                {relayFocus.has(hoveredInfo.id) && <span className="font-semibold text-blue-800"> (relay focus)</span>} · {hoveredInfo.weeklySets} sets/week of {hoveredInfo.target} target ·{' '}
                <span className={COVERAGE_META[hoveredInfo.status].text}>{COVERAGE_META[hoveredInfo.status].label}</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 p-5">
            {coverage.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-inset transition ${relayFocus.has(c.id) ? 'font-extrabold ring-2' : 'font-medium ring-1'} ${selected === c.id ? 'bg-blue-600 text-white ring-blue-600' : relayFocus.has(c.id) ? 'bg-white text-blue-900 ring-blue-600 hover:bg-blue-50' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'}`}
              >
                <span className="h-2 w-2 rounded-full ring-1 ring-white" style={{ background: COVERAGE_META[c.status].color }} />
                {c.label}
              </button>
            ))}
          </div>
        </Card>

        <MusclePanel muscle={selected} relayFocus={relayFocus.has(selected)} className="xl:col-span-3" />
      </div>

      <Card className="mt-5">
        <CardHeader icon={BarChart3} title="Training exposure by muscle group" subtitle={`${period === '7d' ? 'Sets in the last 7 days' : 'Average weekly sets over the last 4 weeks'} as % of each muscle's weekly target · click a bar to select`} />
        <div className="h-[340px] p-3 sm:h-[360px] sm:p-5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={coverage} layout="vertical" margin={{ top: 18, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f7" horizontal={false} />
              <XAxis type="number" {...AXIS} tickFormatter={(v) => `${v}%`} domain={[0, (max: number) => Math.max(150, Math.ceil(max / 50) * 50)]} />
              <YAxis
                type="category"
                dataKey="label"
                {...AXIS}
                width={92}
                tick={(props: { x: number; y: number; payload: { value: string; index: number } }) => {
                  const bold = relayFocus.has(coverage[props.payload.index].id);
                  return (
                    <text x={props.x} y={props.y} dy={4} textAnchor="end" fontSize={12} fontWeight={bold ? 800 : 400} fill={bold ? '#1e3a8a' : '#334155'}>
                      {props.payload.value}
                    </text>
                  );
                }}
              />
              <Tooltip
                cursor={{ fill: '#f1f5f9' }}
                content={({ active, payload }) => {
                  const d = payload?.[0]?.payload as (typeof coverage)[number] | undefined;
                  if (!active || !d) return null;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                      <p className="font-medium text-slate-900">{d.label}</p>
                      <p className="text-slate-600">{d.weeklySets} sets/week · target {d.target}</p>
                      <p className={COVERAGE_META[d.status].text}>{d.pct}% · {COVERAGE_META[d.status].label}</p>
                    </div>
                  );
                }}
              />
              <ReferenceLine x={100} stroke="#64748b" strokeDasharray="4 4" label={{ value: 'Target', position: 'top', fill: '#64748b', fontSize: 11 }} />
              <ReferenceLine x={50} stroke="#cbd5e1" strokeDasharray="2 4" />
              <Bar dataKey="pct" name="% of target" radius={[0, 4, 4, 0]} barSize={18} onClick={(d: { id: MuscleGroup }) => setSelected(d.id)} className="cursor-pointer">
                {coverage.map((c) => (
                  <Cell key={c.id} fill={COVERAGE_META[c.status].color} stroke={selected === c.id ? '#1d4ed8' : undefined} strokeWidth={selected === c.id ? 2 : 0} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function MusclePanel({ muscle, relayFocus, className = '' }: { muscle: MuscleGroup; relayFocus: boolean; className?: string }) {
  const { workouts, today } = useData();
  const d = useMemo(() => muscleDetail(workouts, muscle, today), [workouts, muscle, today]);
  const cov7 = muscleCoverage(workouts, '7d', today).find((c) => c.id === muscle)!;
  const cov4 = muscleCoverage(workouts, '4w', today).find((c) => c.id === muscle)!;
  const meta = COVERAGE_META[cov4.status];
  const ago = d.lastTrained ? diffDays(today, d.lastTrained) : null;
  const trend = d.weekly.length >= 8 ? d.weekly.slice(-4).reduce((a, w) => a + w.sets, 0) / 4 - d.weekly.slice(-8, -4).reduce((a, w) => a + w.sets, 0) / 4 : 0;
  const view = MUSCLES.find((m) => m.id === muscle)!.view;

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selected muscle group · {view === 'both' ? 'front & back' : `${view} view`}</p>
          <h2 className={`mt-0.5 text-xl text-slate-900 ${relayFocus ? 'font-extrabold' : 'font-semibold'}`}>
            {d.label}
            {relayFocus && <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 align-middle text-[11px] font-semibold text-white">Relay focus</span>}
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: meta.soft }}>
          <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
          <span className={meta.text}>{meta.label} · {cov4.pct}% (4-wk)</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 p-5 md:grid-cols-4">
        <MiniStat label="Sets · last 7 days" value={<span className="inline-flex items-center gap-1.5"><Dumbbell size={14} className="text-slate-400" />{d.setsThisWeek}</span>} sub={`${cov7.pct}% of ${d.target} target`} />
        <MiniStat label="Weekly avg (4 wk)" value={<span className="inline-flex items-center gap-1.5"><Target size={14} className="text-slate-400" />{d.avgWeeklySets}</span>} sub={`target ${d.target} sets/week`} />
        <MiniStat label="Last trained" value={<span className="inline-flex items-center gap-1.5"><CalendarClock size={14} className="text-slate-400" />{d.lastTrained ? fmtShort(d.lastTrained) : '—'}</span>} sub={ago === null ? 'no records' : ago === 0 ? 'today' : `${ago} day${ago === 1 ? '' : 's'} ago`} />
        <MiniStat label="Frequency" value={<span className="inline-flex items-center gap-1.5"><Repeat size={14} className="text-slate-400" />{d.sessionsPerWeek}×</span>} sub="sessions / week (4 wk)" />
      </div>

      <div className="grid grid-cols-1 gap-5 px-5 pb-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Exercises performed · last 4 weeks</h4>
          {d.exercises.length ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {d.exercises.slice(0, 8).map((e) => (
                <li key={e.name} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-slate-800">{e.name}</span>
                    <span className="text-[11px] text-slate-500">{e.primary ? 'Primary' : 'Secondary'} · last {fmtShort(e.lastDate)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-slate-600">{e.sets} sets</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No exercises in the last 4 weeks" />
          )}

          <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Strength progression · since block start</h4>
          {d.progression.length ? (
            <ul className="space-y-1.5">
              {d.progression.map((p) => (
                <li key={p.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-700">{p.name}</span>
                  <span className="text-xs text-slate-500">
                    {p.latest.toFixed(1)} {p.unit}{' '}
                    <span className={`ml-1 font-semibold ${p.changePct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtPct(p.changePct)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">No tracked lifts target {d.label.toLowerCase()} as a primary muscle.</p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coverage trend · weekly sets</h4>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              <TrendingUp size={12} className={trend < 0 ? 'rotate-180' : ''} />
              {trend >= 0 ? '+' : ''}{trend.toFixed(1)} sets/wk vs prior 4 wk
            </span>
          </div>
          <div className="h-64 rounded-xl border border-slate-100 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.weekly} margin={{ top: 12, right: 12, left: -22, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="week" tickFormatter={fmtShort} {...AXIS} minTickGap={12} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip content={<ChartTooltip labelFormatter={(l) => `Week of ${fmtShort(String(l))}`} valueFormatter={(v) => `${v} sets`} />} />
                <ReferenceLine y={d.target} stroke="#64748b" strokeDasharray="4 4" label={{ value: `Target ${d.target}`, position: 'insideTopRight', fill: '#64748b', fontSize: 11 }} />
                <Line type="monotone" dataKey="sets" name="Weekly sets" stroke={SERIES.blue} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Current week is partial (to demo date).</p>
        </div>
      </div>
    </Card>
  );
}
