import { Activity, Footprints, Gauge, HeartPulse, Medal, Repeat, Route, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Card, CardHeader, ChartTooltip, DemoBadge, EmptyState, Legend, PageHeader, RANGE_OPTIONS, Segmented, StatCard, TypeBadge } from '../components/ui';
import { useData } from '../context/DataContext';
import { type RangeKey, RANGE_DAYS, avgHr, avgPace, best5kPace, buildBuckets, predictTime, rangeStart, runs, totalKm, type RunRecord } from '../lib/analytics';
import { addDays, fmtLong, fmtShort } from '../lib/dates';
import { fmtPace, fmtTime } from '../lib/format';
import { AXIS, GRID, SERIES } from '../lib/theme';

const GROUPS = [
  { id: 'easy', label: 'Easy / long', color: SERIES.blue, kinds: ['Easy', 'Long'] },
  { id: 'quality', label: 'Tempo / intervals / 5K', color: SERIES.orange, kinds: ['Tempo', 'Intervals', '5K Time Trial'] },
  { id: 'hyrox', label: 'Compromised (HYROX)', color: SERIES.aqua, kinds: ['Compromised'] },
] as const;
const groupOf = (r: RunRecord) => (r.source !== 'Running' ? GROUPS[2] : GROUPS.find((g) => (g.kinds as readonly string[]).includes(r.kind)) ?? GROUPS[0]);

export function RunningPerformance() {
  const { workouts, today, goals } = useData();
  const [range, setRange] = useState<RangeKey>('90d');
  const days = RANGE_DAYS[range];
  const from = rangeStart(range, today);
  const prevFrom = addDays(from, -days);
  const prevTo = addDays(from, -1);
  const all = useMemo(() => runs(workouts.filter((w) => w.date <= today)), [workouts, today]);
  const cur = all.filter((r) => r.date >= from);
  const prev = all.filter((r) => r.date >= prevFrom && r.date <= prevTo);
  const weeks = days / 7;

  const stats = (rs: RunRecord[]) => ({
    weeklyKm: totalKm(rs) / weeks,
    pace: avgPace(rs),
    best: best5kPace(rs),
    hr: avgHr(rs),
    freq: rs.length / weeks,
    longest: rs.reduce<RunRecord | undefined>((a, r) => (!a || r.distanceKm > a.distanceKm ? r : a), undefined),
  });
  const c = stats(cur);
  const p = stats(prev);
  const hasPrev = prev.length > 0;
  const vs = `previous ${days} days`;

  const distData = buildBuckets(range === '7d' ? '7d' : '90d', today)
    .filter((b) => b.to >= from)
    .map((b) => ({ key: b.key, km: totalKm(cur.filter((r) => r.date >= b.from && r.date <= b.to)) }));

  const bestAll = best5kPace(all);
  const predicted = bestAll ? predictTime(bestAll * 5, 5, goals.runGoalDistanceKm) : 0;
  const goalTime = goals.runGoalPaceSecPerKm * goals.runGoalDistanceKm;

  const paceTicks = (v: number) => fmtPace(v);
  const runTooltip = ({ active, payload }: { active?: boolean; payload?: { payload?: unknown }[] }) => {
    const r = payload?.[0]?.payload as RunRecord | undefined;
    if (!active || !r) return null;
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
        <p className="font-medium text-slate-900">{fmtLong(r.date)}</p>
        <p className="text-slate-600">{r.source === 'Running' ? `${r.kind} run` : `${r.source} · ${r.kind}`}</p>
        <p className="mt-1 text-slate-700">{r.distanceKm} km · {fmtPace(r.paceSecPerKm)}/km{r.avgHr ? ` · ${r.avgHr} bpm` : ''}</p>
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Running Performance" subtitle="Includes standalone runs plus run segments inside HYROX and Engine sessions." actions={<><DemoBadge /><Segmented value={range} onChange={setRange} options={RANGE_OPTIONS} /></>} />

      {cur.length === 0 ? (
        <EmptyState title="No runs in this period" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard icon={Route} label="Weekly distance" value={c.weeklyKm.toFixed(1)} unit="km/wk" comparison={hasPrev ? `${p.weeklyKm.toFixed(1)} km/wk ${vs}` : `target ${goals.weeklyRunKmTarget} km/wk`} delta={hasPrev ? c.weeklyKm - p.weeklyKm : undefined} deltaLabel={hasPrev ? `${c.weeklyKm - p.weeklyKm >= 0 ? '+' : ''}${(c.weeklyKm - p.weeklyKm).toFixed(1)} km` : undefined} accent="violet" />
            <StatCard icon={Gauge} label="Average pace" value={fmtPace(c.pace)} unit="/km" comparison={hasPrev ? `${fmtPace(p.pace)}/km ${vs}` : 'distance-weighted'} delta={hasPrev ? c.pace - p.pace : undefined} deltaLabel={hasPrev ? `${Math.round(c.pace - p.pace) > 0 ? '+' : ''}${Math.round(c.pace - p.pace)} s` : undefined} good="down" />
            <StatCard icon={Medal} label="Best 5 km+ pace" value={c.best ? fmtPace(c.best) : '—'} unit="/km" comparison={c.best ? `≈ ${fmtTime(c.best * 5)} for 5 km` : 'no 5 km+ run in period'} delta={hasPrev && c.best && p.best ? c.best - p.best : undefined} deltaLabel={hasPrev && c.best && p.best ? `${Math.round(c.best - p.best) > 0 ? '+' : ''}${Math.round(c.best - p.best)} s` : undefined} good="down" accent="amber" />
            <StatCard icon={HeartPulse} label="Avg running HR" value={String(c.hr)} unit="bpm" comparison={hasPrev ? `${p.hr} bpm ${vs}` : ''} delta={hasPrev ? c.hr - p.hr : undefined} deltaLabel={hasPrev ? `${c.hr - p.hr > 0 ? '+' : ''}${c.hr - p.hr} bpm` : undefined} good="down" accent="rose" />
            <StatCard icon={Repeat} label="Running frequency" value={c.freq.toFixed(1)} unit="runs/wk" comparison={`${cur.length} runs in ${days} days`} delta={hasPrev ? c.freq - p.freq : undefined} deltaLabel={hasPrev ? `${c.freq - p.freq >= 0 ? '+' : ''}${(c.freq - p.freq).toFixed(1)}` : undefined} accent="sky" />
            <StatCard icon={Footprints} label="Longest run" value={c.longest ? c.longest.distanceKm.toFixed(1) : '—'} unit="km" comparison={c.longest ? `${c.longest.kind} · ${fmtShort(c.longest.date)}` : ''} delta={hasPrev && p.longest && c.longest ? c.longest.distanceKm - p.longest.distanceKm : undefined} deltaLabel={hasPrev && p.longest && c.longest ? `${c.longest.distanceKm - p.longest.distanceKm >= 0 ? '+' : ''}${(c.longest.distanceKm - p.longest.distanceKm).toFixed(1)} km` : undefined} accent="emerald" />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader icon={Gauge} title="Running pace progression" subtitle="Average pace per run · lower is faster" action={<Legend items={GROUPS.map((g) => ({ label: g.label, color: g.color }))} />} />
              <div className="h-60 p-3 sm:h-72 sm:p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmtShort(new Date(v).toISOString().slice(0, 10))} {...AXIS} />
                    <YAxis dataKey="paceSecPerKm" type="number" reversed domain={['dataMin - 10', 'dataMax + 10']} tickFormatter={paceTicks} {...AXIS} width={44} />
                    <ZAxis range={[60, 60]} />
                    <Tooltip content={runTooltip} cursor={{ strokeDasharray: '3 3' }} />
                    {GROUPS.map((g) => (
                      <Scatter key={g.id} name={g.label} data={cur.filter((r) => groupOf(r).id === g.id).map((r) => ({ ...r, t: new Date(r.date).getTime() }))} fill={g.color} line={{ stroke: g.color, strokeWidth: 1.5 }} stroke="#fff" strokeWidth={1.5} />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader icon={Route} title={range === '7d' ? 'Daily distance' : 'Weekly distance'} subtitle={`${totalKm(cur).toFixed(1)} km in period · weekly target ${goals.weeklyRunKmTarget} km`} />
              <div className="h-60 p-3 sm:h-72 sm:p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="key" tickFormatter={fmtShort} {...AXIS} minTickGap={8} />
                    <YAxis {...AXIS} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip labelFormatter={(l) => (range === '7d' ? fmtLong(String(l)) : `Week of ${fmtShort(String(l))}`)} valueFormatter={(v) => `${v} km`} />} />
                    <Bar dataKey="km" name="Distance" fill={SERIES.violet} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader icon={HeartPulse} title="Average heart rate" subtitle="Per run, by run type" action={<Legend items={GROUPS.map((g) => ({ label: g.label, color: g.color }))} />} />
              <div className="h-60 p-3 sm:h-72 sm:p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmtShort(new Date(v).toISOString().slice(0, 10))} {...AXIS} allowDuplicatedCategory={false} />
                    <YAxis {...AXIS} domain={['dataMin - 5', 'dataMax + 5']} unit="" />
                    <Tooltip content={runTooltip} />
                    {GROUPS.map((g) => (
                      <Line key={g.id} data={cur.filter((r) => groupOf(r).id === g.id && r.avgHr).map((r) => ({ ...r, t: new Date(r.date).getTime() }))} dataKey="avgHr" name={g.label} stroke={g.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader icon={Activity} title="Pace vs heart rate" subtitle="Down-and-right over time = faster at lower effort" action={<Legend items={GROUPS.map((g) => ({ label: g.label, color: g.color }))} />} />
              <div className="h-60 p-3 sm:h-72 sm:p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, left: -4, bottom: 14 }}>
                    <CartesianGrid stroke="#eef2f7" />
                    <XAxis dataKey="paceSecPerKm" type="number" reversed domain={['dataMin - 10', 'dataMax + 10']} tickFormatter={paceTicks} {...AXIS} name="Pace" label={{ value: 'pace /km (faster →)', position: 'insideBottomRight', offset: -12, fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis dataKey="avgHr" type="number" domain={['dataMin - 4', 'dataMax + 4']} {...AXIS} width={44} name="HR" />
                    <ZAxis range={[60, 60]} />
                    <Tooltip content={runTooltip} cursor={{ strokeDasharray: '3 3' }} />
                    {GROUPS.map((g) => (
                      <Scatter key={g.id} name={g.label} data={cur.filter((r) => groupOf(r).id === g.id && r.avgHr)} fill={g.color} stroke="#fff" strokeWidth={1.5} />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader icon={Target} title={`${goals.runGoalDistanceKm} km goal`} subtitle="Long-term example goal (edit on Overview)" />
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-blue-50 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-blue-700">Goal</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{fmtTime(goalTime)}</p>
                <p className="text-xs text-slate-500">{fmtPace(goals.runGoalPaceSecPerKm)}/km</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Predicted now</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{predicted ? fmtTime(predicted) : '—'}</p>
                <p className="text-xs text-slate-500">{predicted ? `${fmtPace(predicted / goals.runGoalDistanceKm)}/km` : ''}</p>
              </div>
            </div>
            {predicted > 0 && (
              <p className="text-sm text-slate-600">
                Gap to goal: <b className="font-semibold text-slate-900">{fmtTime(Math.max(0, predicted - goalTime))}</b> ({Math.max(0, Math.round((predicted - goalTime) / goals.runGoalDistanceKm))} s/km). Prediction uses the Riegel formula from the best 5 km+ standalone run.
              </p>
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader icon={Footprints} title="Recent runs" subtitle="Most recent first" />
          <ul className="mt-3 divide-y divide-slate-100 md:hidden">
            {[...cur].reverse().slice(0, 8).map((r) => (
              <li key={r.workoutId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><TypeBadge type={r.source} /><span className="text-xs text-slate-500">{fmtShort(r.date)}</span></span>
                  <span className="mt-0.5 block text-sm text-slate-700">{r.kind} · {r.distanceKm} km</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold text-slate-900">{fmtPace(r.paceSecPerKm)}/km</span>
                  <span className="text-xs text-slate-500">{r.avgHr ? `${r.avgHr} bpm` : '—'}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Session</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 text-right font-medium">Distance</th>
                  <th className="px-3 py-2 text-right font-medium">Pace</th>
                  <th className="px-5 py-2 text-right font-medium">Avg HR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...cur].reverse().slice(0, 8).map((r) => (
                  <tr key={r.workoutId}>
                    <td className="px-5 py-2.5 text-slate-600">{fmtShort(r.date)}</td>
                    <td className="px-3 py-2.5"><TypeBadge type={r.source} /></td>
                    <td className="px-3 py-2.5 text-slate-700">{r.kind}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{r.distanceKm} km</td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-900">{fmtPace(r.paceSecPerKm)}/km</td>
                    <td className="px-5 py-2.5 text-right text-slate-700">{r.avgHr ? `${r.avgHr} bpm` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
