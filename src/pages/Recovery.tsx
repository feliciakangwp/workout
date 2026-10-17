import { Activity, BatteryMedium, Flame, Gauge, HeartPulse, Info, Moon, Waves } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader, ChartTooltip, Legend, PageHeader, RANGE_OPTIONS, Segmented, StatCard } from '../components/ui';
import { useData } from '../context/DataContext';
import { type RangeKey, rangeStart, recoverySeries, recoveryStatus, sessionLoad, sortByDate } from '../lib/analytics';
import { fmtLong, fmtShort } from '../lib/dates';
import { AXIS, GRID, SERIES, TYPE_COLORS } from '../lib/theme';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function Recovery() {
  const { workouts, recovery, today } = useData();
  const [range, setRange] = useState<RangeKey>('30d');
  const series = useMemo(() => recoverySeries(recovery, workouts, today), [recovery, workouts, today]);
  const from = rangeStart(range, today);
  const data = series.filter((p) => p.date >= from);
  const last = series[series.length - 1];
  const yesterday = series[series.length - 2];
  const baseline = series.slice(-29, -1);
  const status = recoveryStatus(last.recoveryScore);
  const acwr = last.acuteLoad / (last.chronicLoad || 1);
  const dense = range !== '7d';
  const recent = sortByDate(workouts.filter((w) => w.date <= today)).slice(-14);

  const delta = (cur: number, base: number, digits = 0) => {
    const d = cur - base;
    return { delta: d, deltaLabel: `${d > 0 ? '+' : ''}${d.toFixed(digits)}` };
  };
  const statusTone = { good: 'bg-emerald-50 text-emerald-700 ring-emerald-200', moderate: 'bg-amber-50 text-amber-700 ring-amber-200', low: 'bg-rose-50 text-rose-700 ring-rose-200' }[status.tone];

  return (
    <div>
      <PageHeader title="Recovery" subtitle={`Morning metrics for ${fmtLong(today)} compared with the 28-day average.`} actions={<Segmented value={range} onChange={setRange} options={RANGE_OPTIONS} />} />

      <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          <b className="font-semibold">Sample Garmin-style metrics.</b> This prototype is not connected to Garmin or any wearable. Sleep, HRV, resting HR and Body Battery are demonstration values; training load and soreness are modelled from the workout log.
        </p>
      </div>

      <Card className="mb-5 flex flex-wrap items-center gap-5 p-5">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={status.tone === 'good' ? '#22a35a' : status.tone === 'moderate' ? '#eda100' : '#e34948'} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(last.recoveryScore / 100) * 97.4} 97.4`} />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold text-slate-900">{last.recoveryScore}</span>
            <span className="text-[10px] text-slate-500">/ 100</span>
          </span>
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Recovery status</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusTone}`}>{status.label}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Composite of sleep score (30%), Body Battery (30%), HRV vs baseline (20%) and soreness (20%). Yesterday: {yesterday.recoveryScore}. Acute:chronic load ratio {acwr.toFixed(2)}{' '}
            {acwr > 1.3 ? '— ramping quickly.' : acwr < 0.8 ? '— load is low.' : '— within the 0.8–1.3 range.'}
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard icon={Moon} label="Sleep duration" value={last.sleepHours.toFixed(1)} unit="h" comparison={`28-day avg ${avg(baseline.map((p) => p.sleepHours)).toFixed(1)} h`} {...delta(last.sleepHours, avg(baseline.map((p) => p.sleepHours)), 1)} accent="violet" />
        <StatCard icon={Gauge} label="Sleep score" value={String(last.sleepScore)} comparison={`avg ${Math.round(avg(baseline.map((p) => p.sleepScore)))}`} {...delta(last.sleepScore, avg(baseline.map((p) => p.sleepScore)))} accent="sky" />
        <StatCard icon={HeartPulse} label="Resting HR" value={String(last.restingHr)} unit="bpm" comparison={`avg ${avg(baseline.map((p) => p.restingHr)).toFixed(0)} bpm`} {...delta(last.restingHr, avg(baseline.map((p) => p.restingHr)))} good="down" accent="rose" />
        <StatCard icon={Waves} label="HRV (overnight)" value={String(last.hrv)} unit="ms" comparison={`avg ${avg(baseline.map((p) => p.hrv)).toFixed(0)} ms`} {...delta(last.hrv, avg(baseline.map((p) => p.hrv)))} accent="emerald" />
        <StatCard icon={BatteryMedium} label="Body Battery" value={String(last.bodyBattery)} unit="/100" comparison={`avg ${avg(baseline.map((p) => p.bodyBattery)).toFixed(0)}`} {...delta(last.bodyBattery, avg(baseline.map((p) => p.bodyBattery)))} accent="blue" />
        <StatCard icon={Flame} label="Training load (7d)" value={last.acuteLoad.toLocaleString()} comparison={`chronic ${last.chronicLoad.toLocaleString()} / wk`} {...delta(last.acuteLoad, last.chronicLoad)} accent="amber" good="down" />
        <StatCard icon={Activity} label="Muscle soreness" value={String(last.soreness)} unit="/10" comparison={`avg ${avg(baseline.map((p) => p.soreness)).toFixed(1)}`} {...delta(last.soreness, avg(baseline.map((p) => p.soreness)))} good="down" accent="rose" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Waves} title="Recovery trends" subtitle="Overnight HRV and resting heart rate" action={<Legend items={[{ label: 'HRV (ms)', color: SERIES.aqua }, { label: 'Resting HR (bpm)', color: SERIES.red }]} />} />
          <div className="grid grid-cols-1 gap-2 p-3 sm:p-5">
            {([['hrv', 'HRV', SERIES.aqua, 'ms'], ['restingHr', 'Resting HR', SERIES.red, 'bpm']] as const).map(([key, name, color, unit]) => (
              <div key={key} className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} syncId="rec">
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="date" tickFormatter={fmtShort} {...AXIS} minTickGap={16} hide={key === 'hrv'} />
                    <YAxis {...AXIS} domain={['dataMin - 3', 'dataMax + 3']} />
                    <Tooltip content={<ChartTooltip labelFormatter={(l) => fmtLong(String(l))} valueFormatter={(v) => `${v} ${unit}`} />} />
                    <Line type="monotone" dataKey={key} name={name} stroke={color} strokeWidth={2} dot={!dense} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader icon={Moon} title="Sleep" subtitle="Nightly duration (bars) · sleep score shown in tooltip" />
          <div className="h-60 p-3 sm:h-72 sm:p-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="date" tickFormatter={fmtShort} {...AXIS} minTickGap={16} />
                <YAxis {...AXIS} domain={[4, 10]} unit="h" />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  content={({ active, payload }) => {
                    const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
                    if (!active || !d) return null;
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                        <p className="font-medium text-slate-900">{fmtLong(d.date)}</p>
                        <p className="text-slate-700">{d.sleepHours} h · score {d.sleepScore}</p>
                        <p className="text-slate-500">Body Battery {d.bodyBattery}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="sleepHours" name="Sleep" radius={[3, 3, 0, 0]} maxBarSize={22}>
                  {data.map((d) => (
                    <Cell key={d.date} fill={d.sleepScore >= 75 ? SERIES.violet : d.sleepScore >= 60 ? '#a39af0' : '#d4d0f7'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="-mt-1"><Legend items={[{ label: 'Score ≥ 75', color: SERIES.violet }, { label: '60–74', color: '#a39af0' }, { label: '< 60', color: '#d4d0f7' }]} /></div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={Flame} title="Training load" subtitle="Daily session load (duration × RPE) and 7-day acute load" action={<Legend items={[{ label: 'Daily load', color: SERIES.orange }, { label: 'Acute (7d) ÷ 7', color: SERIES.blue }]} />} />
          <div className="h-60 p-3 sm:h-72 sm:p-5">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.map((d) => ({ ...d, acuteAvg: Math.round(d.acuteLoad / 7), chronicAvg: Math.round(d.chronicLoad / 7) }))} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="date" tickFormatter={fmtShort} {...AXIS} minTickGap={16} />
                <YAxis {...AXIS} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip labelFormatter={(l) => fmtLong(String(l))} />} />
                <Bar dataKey="load" name="Daily load" fill={SERIES.orange} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Line type="monotone" dataKey="acuteAvg" name="Acute avg / day" stroke={SERIES.blue} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader icon={Activity} title="Recent workout intensity" subtitle="Last 14 sessions · session RPE" action={<Legend items={(['F45', 'Strength', 'HYROX Engine', 'HYROX', 'Running', 'Recovery'] as const).map((t) => ({ label: t, color: TYPE_COLORS[t] }))} />} />
          <div className="h-60 p-3 sm:h-72 sm:p-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recent.map((w) => ({ ...w, load: sessionLoad(w) }))} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="date" tickFormatter={fmtShort} {...AXIS} minTickGap={4} />
                <YAxis {...AXIS} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  content={({ active, payload }) => {
                    const d = payload?.[0]?.payload as (typeof recent)[number] & { load: number } | undefined;
                    if (!active || !d) return null;
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                        <p className="font-medium text-slate-900">{d.title}</p>
                        <p className="text-slate-600">{fmtLong(d.date)}</p>
                        <p className="text-slate-700">RPE {d.intensity}/10 · {d.durationMin} min · load {d.load}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="intensity" name="RPE" radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {recent.map((w) => (
                    <Cell key={w.id} fill={TYPE_COLORS[w.type]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
