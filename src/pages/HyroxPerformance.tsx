import { Award, CalendarClock, History, Radar as RadarIcon, Timer, Trophy, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader, DemoBadge, EmptyState, Legend, PageHeader, StatCard, TrendBadge } from '../components/ui';
import { useData } from '../context/DataContext';
import { STATION_BY_ID, stationSpec } from '../data/stations';
import { RacePlan } from '../components/RacePlan';
import { RaceAnalysis } from '../components/RaceAnalysis';
import { RaceEstimateCard, SimAnalysisCard } from '../components/SimAnalysis';
import type { StationId } from '../data/types';
import { raceDivision, stationSummaries, upcomingRaces } from '../lib/analytics';
import { diffDays, fmtLong, fmtShort } from '../lib/dates';
import { fmtTime } from '../lib/format';
import { AXIS, GRID, SERIES } from '../lib/theme';

/** Short station names so radar labels fit narrow cards. */
const RADAR_LABEL: Record<StationId, string> = {
  skierg: 'SkiErg',
  sledPush: 'Sled Push',
  sledPull: 'Sled Pull',
  burpeeBroadJump: 'Burpees',
  rowing: 'Row',
  farmersCarry: 'Farmers',
  sandbagLunges: 'Lunges',
  wallBalls: 'Wall Balls',
};

export function HyroxPerformance() {
  const { workouts, goals, today } = useData();
  const summaries = useMemo(() => stationSummaries(workouts), [workouts]);
  const weakest = [...summaries].filter((s) => s.latest).sort((a, b) => a.latest!.score - b.latest!.score)[0];
  const [selected, setSelected] = useState<StationId>(weakest?.id ?? 'skierg');
  const sel = summaries.find((s) => s.id === selected)!;
  const info = STATION_BY_ID[selected];

  const withData = summaries.filter((s) => s.latest);
  const totalLatest = withData.reduce((a, s) => a + s.latest!.timeSec, 0);
  const totalFirst = withData.reduce((a, s) => a + s.first!.timeSec, 0);
  const totalTarget = withData.reduce((a, s) => a + STATION_BY_ID[s.id].targetSec, 0);
  const onTarget = withData.filter((s) => s.latest!.score >= 95).length;
  const nextComp = upcomingRaces(goals, today)[0];
  const division = nextComp ? raceDivision(nextComp, goals.athleteSex) : { sex: goals.athleteSex, category: 'open' as const };

  const narrow = window.innerWidth < 640;
  const radarData = summaries.map((s) => ({ id: s.id, station: RADAR_LABEL[s.id], latest: s.latest?.score ?? 0, baseline: s.first?.score ?? 0 }));

  return (
    <div>
      <PageHeader title="HYROX Performance" subtitle="Station results from simulations and station practice. Half and ¾ sim times are scaled to full distance for comparison." actions={<DemoBadge />} />

      <div className="mb-5 space-y-5">
        <RacePlan />
        <RaceAnalysis />
        <SimAnalysisCard />
        <RaceEstimateCard />
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={Timer} label="Total station time (latest)" value={fmtTime(totalLatest)} comparison={`${fmtTime(totalFirst)} at block start · target ${fmtTime(totalTarget)}`} delta={totalFirst - totalLatest} deltaLabel={`−${fmtTime(Math.max(0, totalFirst - totalLatest))}`} />
        <StatCard icon={Zap} label="Average improvement" value={`${(withData.reduce((a, s) => a + s.improvementPct, 0) / (withData.length || 1)).toFixed(1)}%`} comparison="faster than first recorded attempt" accent="emerald" />
        <StatCard icon={Award} label="Stations near target" value={`${onTarget}/8`} comparison="scoring ≥ 95 (100 = example target)" accent="amber" />
        <StatCard icon={CalendarClock} label={nextComp ? nextComp.name : 'Next competition'} value={nextComp ? String(diffDays(nextComp.date, today)) : '—'} unit="days" comparison={nextComp ? fmtLong(nextComp.date) : 'Add one under Athlete & races'} accent="violet" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader icon={RadarIcon} title="Station performance radar" subtitle="Score = target time ÷ actual time × 100 · click a station name" />
          <div className="px-5 pt-3">
            <Legend items={[{ label: 'Latest', color: SERIES.blue }, { label: 'Block start', color: '#94a3b8' }]} />
          </div>
          <div className="h-[300px] px-1 pb-4 sm:h-[360px] sm:px-2">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius={narrow ? '62%' : '70%'} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis
                  dataKey="station"
                  tick={(props: { x: number; y: number; payload: { value: string; index: number }; textAnchor: 'start' | 'middle' | 'end' }) => {
                    const d = radarData[props.payload.index];
                    const active = d.id === selected;
                    return (
                      <text x={props.x} y={props.y} textAnchor={props.textAnchor} dominantBaseline="central" className="cursor-pointer" fontSize={narrow ? 9.5 : 11} fontWeight={active ? 700 : 500} fill={active ? '#1d4ed8' : '#475569'} onClick={() => setSelected(d.id)}>
                        {props.payload.value}
                      </text>
                    );
                  }}
                />
                <PolarRadiusAxis angle={90} domain={[50, 110]} tick={{ fontSize: 9, fill: '#94a3b8' }} tickCount={4} axisLine={false} />
                <Radar name="Block start" dataKey="baseline" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.12} strokeWidth={1.5} strokeDasharray="4 3" />
                <Radar name="Latest" dataKey="latest" stroke={SERIES.blue} fill={SERIES.blue} fillOpacity={0.2} strokeWidth={2} dot={{ r: 3 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    const d = payload?.[0]?.payload as (typeof radarData)[number] | undefined;
                    if (!active || !d) return null;
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                        <p className="font-medium text-slate-900">{STATION_BY_ID[d.id].name}</p>
                        <p className="text-slate-600">Latest score {d.latest} · start {d.baseline}</p>
                      </div>
                    );
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            icon={History}
            title={`${info.name} · performance history`}
            subtitle={`${stationSpec(selected, division)} · example target ${fmtTime(info.targetSec)} · ${sel.history.length} attempts`}
            action={sel.best && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">PB {fmtTime(sel.best.timeSec)}</span>}
          />
          {sel.history.length === 0 ? (
            <div className="p-5"><EmptyState title="No attempts recorded" text="Add a HYROX workout with station times." /></div>
          ) : (
            <>
              <div className="h-56 p-3 sm:h-64 sm:p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sel.history} margin={{ top: 8, right: 16, left: -4, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="date" tickFormatter={fmtShort} {...AXIS} minTickGap={12} />
                    <YAxis {...AXIS} reversed domain={[(min: number) => Math.min(min, info.targetSec) - 10, 'dataMax + 10']} tickFormatter={(v) => fmtTime(v)} width={48} />
                    <Tooltip
                      content={({ active, payload }) => {
                        const d = payload?.[0]?.payload as (typeof sel.history)[number] | undefined;
                        if (!active || !d) return null;
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                            <p className="font-medium text-slate-900">{fmtLong(d.date)}</p>
                            <p className="text-slate-700">{fmtTime(d.timeSec)}{info.derived ? ` · ${info.derived.compute(d.timeSec)}` : ''}</p>
                            {d.fraction < 1 && <p className="text-amber-700">Est. full distance from {fmtTime(d.rawSec)} at {d.fraction === 0.5 ? 'half' : '¾'} distance</p>}
                            <p className="text-slate-500">Score {d.score}</p>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={info.targetSec} stroke={SERIES.aqua} strokeDasharray="4 4" label={{ value: 'Target', position: 'insideTopRight', fill: SERIES.aqua, fontSize: 11 }} />
                    <Line type="monotone" dataKey="timeSec" name="Time" stroke={SERIES.blue} strokeWidth={2} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="-mt-1 text-right text-[10px] text-slate-400">axis reversed · higher = faster</p>
              </div>
              <div className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-4">
                <Mini label="Latest" value={fmtTime(sel.latest!.timeSec)} sub={fmtShort(sel.latest!.date)} />
                <Mini label="Previous" value={sel.previous ? fmtTime(sel.previous.timeSec) : '—'} sub={sel.previous ? fmtShort(sel.previous.date) : ''} />
                <Mini label="Personal best" value={fmtTime(sel.best!.timeSec)} sub={fmtShort(sel.best!.date)} />
                <Mini label={info.derived?.label ?? 'Score'} value={info.derived ? info.derived.compute(sel.latest!.timeSec) : String(sel.latest!.score)} sub={`${sel.improvementPct.toFixed(1)}% faster than first`} />
              </div>
            </>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">All stations</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaries.map((s) => {
          const st = STATION_BY_ID[s.id];
          const active = s.id === selected;
          return (
            <button key={s.id} onClick={() => setSelected(s.id)} className={`card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${active ? 'ring-2 ring-blue-500' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold text-slate-400">STATION {st.order}</p>
                  <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-500">{stationSpec(s.id, division)}</p>
                </div>
                {s.latest && s.previous ? (
                  <TrendBadge delta={s.changeVsPreviousSec} label={`${s.changeVsPreviousSec >= 0 ? '−' : '+'}${Math.abs(s.changeVsPreviousSec)}s`} />
                ) : (
                  <Trophy size={16} className="text-slate-300" />
                )}
              </div>
              {s.latest ? (
                <>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{fmtTime(s.latest.timeSec)}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${Math.min(100, s.latest.score)}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-slate-500">
                    <span>Prev {s.previous ? fmtTime(s.previous.timeSec) : '—'}</span>
                    <span>PB {fmtTime(s.best!.timeSec)}</span>
                    <span>Score {s.latest.score}</span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-emerald-600">{s.improvementPct.toFixed(1)}% faster since first attempt</p>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No attempts yet</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
