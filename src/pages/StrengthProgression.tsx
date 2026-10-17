import { Award, BarChart3, Dumbbell, History, Layers, LineChart as LineIcon, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts';
import { Card, CardHeader, ChartTooltip, DemoBadge, EmptyState, PageHeader, Segmented, StatCard, TrendBadge } from '../components/ui';
import { useData } from '../context/DataContext';
import { TRACKED_LIFTS } from '../data/exercises';
import { type LiftSession, liftStrength, liftSummary } from '../lib/analytics';
import { fmtLong, fmtShort } from '../lib/dates';
import { fmtPct, pctChange } from '../lib/format';
import { AXIS, GRID, SERIES } from '../lib/theme';

type Metric = 'weight' | 'strength' | 'volume';
const isCarry = (name: string) => name === "Farmer's Carry";
const repLabel = (name: string, s: LiftSession) => `${s.sets} × ${s.reps}${isCarry(name) ? ' m' : ''}`;
const volUnit = (name: string) => (isCarry(name) ? 'kg·m' : 'kg');

export function StrengthProgression() {
  const { workouts } = useData();
  const [exercise, setExercise] = useState(TRACKED_LIFTS[0]);
  const [metric, setMetric] = useState<Metric>('weight');
  const summaries = useMemo(() => TRACKED_LIFTS.map((n) => liftSummary(workouts, n)), [workouts]);
  const s = summaries.find((x) => x.name === exercise)!;
  const { latest, previous, pr, history } = s;
  const carry = isCarry(exercise);
  const chartData = history.map((h) => ({ ...h, strength: Math.round(liftStrength(h) * 10) / 10 }));
  const metricMeta: Record<Metric, { key: string; name: string; unit: string; color: string }> = {
    weight: { key: 'weightKg', name: carry ? 'Load per hand' : 'Working weight', unit: 'kg', color: SERIES.blue },
    strength: { key: 'strength', name: carry ? 'Load per hand' : 'Estimated 1RM', unit: 'kg', color: SERIES.orange },
    volume: { key: 'volume', name: 'Session volume', unit: volUnit(exercise), color: SERIES.aqua },
  };
  const m = metricMeta[metric];

  return (
    <div>
      <PageHeader title="Strength Progression" subtitle="Tracked lifts from the Wednesday strength sessions and any workouts you add." actions={<DemoBadge />} />

      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        {summaries.map((x) => (
          <button
            key={x.name}
            onClick={() => setExercise(x.name)}
            className={`shrink-0 rounded-xl border px-3.5 py-2 text-left transition ${exercise === x.name ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'}`}
          >
            <span className="block text-sm font-medium">{x.name}</span>
            <span className={`text-xs ${exercise === x.name ? 'text-blue-100' : 'text-slate-500'}`}>
              {x.latest ? `${x.latest.weightKg} kg · ${fmtPct(x.changeSinceStartPct)}` : 'No data'}
            </span>
          </button>
        ))}
      </div>

      {!latest ? (
        <EmptyState title={`No sessions recorded for ${exercise}`} text="Add a workout containing this exercise to see progress." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard icon={Dumbbell} label={carry ? 'Latest load (per hand)' : 'Latest weight'} value={String(latest.weightKg)} unit="kg" comparison={fmtLong(latest.date)} delta={previous ? latest.weightKg - previous.weightKg : undefined} deltaLabel={previous ? `${latest.weightKg - previous.weightKg >= 0 ? '+' : ''}${latest.weightKg - previous.weightKg} kg` : undefined} />
            <StatCard icon={Layers} label="Sets × reps" value={repLabel(exercise, latest)} comparison={previous ? `Previous: ${repLabel(exercise, previous)}` : 'First session'} accent="sky" />
            <StatCard icon={History} label="Previous performance" value={previous ? String(previous.weightKg) : '—'} unit={previous ? 'kg' : ''} comparison={previous ? `${repLabel(exercise, previous)} · ${fmtShort(previous.date)}` : 'No previous session'} accent="violet" />
            <StatCard icon={TrendingUp} label={carry ? 'Load progression' : 'Strength progression'} value={fmtPct(s.changeSinceStartPct, 1)} comparison={carry ? 'load since first session' : 'est. 1RM since first session'} delta={s.changeVsPreviousPct} deltaLabel={`${fmtPct(s.changeVsPreviousPct, 1)} vs prev`} accent="emerald" />
            <StatCard icon={BarChart3} label="Training volume" value={latest.volume.toLocaleString()} unit={volUnit(exercise)} comparison="sets × reps × load, latest session" delta={previous ? latest.volume - previous.volume : undefined} deltaLabel={previous ? fmtPct(pctChange(latest.volume, previous.volume)) : undefined} accent="amber" />
            <StatCard icon={Award} label="Personal record" value={pr ? String(pr.weightKg) : '—'} unit="kg" comparison={pr ? `${repLabel(exercise, pr)} · ${fmtShort(pr.date)}` : ''} accent="rose" />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                icon={LineIcon}
                title={`${exercise} · ${m.name}`}
                subtitle={`${history.length} sessions recorded`}
                action={<Segmented value={metric} onChange={setMetric} options={[{ value: 'weight', label: 'Weight' }, { value: 'strength', label: carry ? 'Load' : 'Est. 1RM' }, { value: 'volume', label: 'Volume' }]} />}
              />
              <div className="h-64 p-3 sm:h-80 sm:p-5">
                <ResponsiveContainer width="100%" height="100%">
                  {metric === 'volume' ? (
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="date" tickFormatter={fmtShort} {...AXIS} minTickGap={12} />
                      <YAxis {...AXIS} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip labelFormatter={(l) => fmtLong(String(l))} valueFormatter={(v) => `${Number(v).toLocaleString()} ${m.unit}`} />} />
                      <Bar dataKey="volume" name="Session volume" fill={m.color} radius={[4, 4, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  ) : (
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="date" tickFormatter={fmtShort} {...AXIS} minTickGap={12} />
                      <YAxis {...AXIS} domain={['dataMin - 3', 'dataMax + 3']} tickFormatter={(v) => `${Math.round(v)}`} unit=" kg" width={60} />
                      <Tooltip content={<ChartTooltip labelFormatter={(l) => fmtLong(String(l))} valueFormatter={(v) => `${v} kg`} />} />
                      <Line type="monotone" dataKey={m.key} name={m.name} stroke={m.color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader icon={History} title="Latest vs previous workout" subtitle={previous ? `${fmtShort(latest.date)} vs ${fmtShort(previous.date)}` : 'Only one session recorded'} />
              <div className="p-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="pb-2 font-medium">Metric</th>
                      <th className="pb-2 text-right font-medium">Previous</th>
                      <th className="pb-2 text-right font-medium">Latest</th>
                      <th className="pb-2 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      { label: 'Weight', a: previous?.weightKg, b: latest.weightKg, unit: 'kg' },
                      { label: 'Sets', a: previous?.sets, b: latest.sets, unit: '' },
                      { label: carry ? 'Distance' : 'Reps', a: previous?.reps, b: latest.reps, unit: carry ? 'm' : '' },
                      { label: 'Volume', a: previous?.volume, b: latest.volume, unit: volUnit(exercise) },
                      ...(carry ? [] : [{ label: 'Est. 1RM', a: previous?.e1rm, b: latest.e1rm, unit: 'kg' }]),
                    ].map((r) => {
                      const delta = r.a !== undefined ? r.b - r.a : 0;
                      return (
                        <tr key={r.label}>
                          <td className="py-2.5 text-slate-600">{r.label}</td>
                          <td className="py-2.5 text-right text-slate-500">{r.a !== undefined ? `${r.a.toLocaleString()} ${r.unit}` : '—'}</td>
                          <td className="py-2.5 text-right font-medium text-slate-900">{r.b.toLocaleString()} {r.unit}</td>
                          <td className="py-2.5 text-right">{r.a !== undefined ? <TrendBadge delta={delta} label={`${delta > 0 ? '+' : ''}${Math.round(delta * 10) / 10}`} /> : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] text-slate-500">Est. 1RM uses the Epley formula: weight × (1 + reps / 30).</p>
              </div>
            </Card>
          </div>
        </>
      )}

      <Card className="mt-5 overflow-hidden">
        <CardHeader icon={Dumbbell} title="All tracked exercises" subtitle="Tap an exercise to analyse it" />
        <ul className="mt-3 divide-y divide-slate-100 md:hidden">
          {summaries.map((x) => (
            <li key={x.name}>
              <button onClick={() => { setExercise(x.name); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${x.name === exercise ? 'bg-blue-50/70' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">{x.name}</span>
                  <span className="block text-xs text-slate-500">
                    {x.latest ? `${x.latest.weightKg} kg · ${repLabel(x.name, x.latest)}` : 'No data'}
                    {x.pr ? ` · PR ${x.pr.weightKg} kg` : ''}
                  </span>
                </span>
                <TrendBadge delta={x.changeSinceStartPct} label={fmtPct(x.changeSinceStartPct)} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-medium">Exercise</th>
                <th className="px-3 py-2.5 font-medium">Latest</th>
                <th className="px-3 py-2.5 font-medium">Sets × reps</th>
                <th className="px-3 py-2.5 font-medium">Previous</th>
                <th className="px-3 py-2.5 font-medium">Volume</th>
                <th className="px-3 py-2.5 font-medium">PR</th>
                <th className="px-3 py-2.5 font-medium">Progress</th>
                <th className="px-5 py-2.5 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaries.map((x) => (
                <tr key={x.name} onClick={() => setExercise(x.name)} className={`cursor-pointer transition hover:bg-blue-50/50 ${x.name === exercise ? 'bg-blue-50/70' : ''}`}>
                  <td className="px-5 py-2.5 font-medium text-slate-800">{x.name}</td>
                  <td className="px-3 py-2.5 text-slate-700">{x.latest ? `${x.latest.weightKg} kg` : '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{x.latest ? repLabel(x.name, x.latest) : '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{x.previous ? `${x.previous.weightKg} kg` : '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{x.latest ? `${x.latest.volume.toLocaleString()} ${volUnit(x.name)}` : '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{x.pr ? `${x.pr.weightKg} kg` : '—'}</td>
                  <td className="px-3 py-2.5"><TrendBadge delta={x.changeSinceStartPct} label={fmtPct(x.changeSinceStartPct)} /></td>
                  <td className="px-5 py-1.5">
                    <div className="h-8 w-28">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={x.history.map((h) => ({ v: liftStrength(h) }))}>
                          <YAxis hide domain={['dataMin', 'dataMax']} />
                          <Line type="monotone" dataKey="v" stroke={SERIES.blue} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
