import { Pencil, Trophy, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { STATION_BY_ID } from '../data/stations';
import type { Race } from '../data/types';
import { compareRaces, completedRaces, previousRace, raceStations, raceTypeLabel, resultTotals, teamLabel, type SegmentDelta } from '../lib/analytics';
import { fmtLong } from '../lib/dates';
import { fmtTime } from '../lib/format';
import { AXIS } from '../lib/theme';
import { Card, CardHeader, Legend, TrendBadge } from './ui';

const FASTER = '#22a35a';
const SLOWER = '#e34948';

const signed = (sec: number) => `${sec > 0 ? '+' : sec < 0 ? '−' : ''}${fmtTime(Math.abs(sec))}`;

/** Training tip for the segment that lost the most time. */
function tipFor(seg: SegmentDelta, slowed: SegmentDelta[]) {
  const lateRuns = slowed.filter((s) => s.key.startsWith('run-') && ['run-sandbagLunges', 'run-wallBalls', 'run-farmersCarry'].includes(s.key));
  if (lateRuns.length >= 2) return 'Your late runs slowed — add running straight after lunges and wall balls in your sims to build compromised-running endurance.';
  if (seg.key.startsWith('run-')) return `${seg.label} slowed — practise holding race pace after the station before it.`;
  const tips: Record<string, string> = {
    skierg: 'Add SkiErg intervals with a strong pull-through from the lats and triceps.',
    sledPush: 'Build leg drive: heavy sled pushes and split squats.',
    sledPull: 'Add heavy sled pulls, rows and grip work.',
    burpeeBroadJump: 'Practise a steady burpee broad jump rhythm under fatigue.',
    rowing: 'Row intervals at race pace with a strong leg drive.',
    farmersCarry: 'Train grip endurance with longer, heavier carries.',
    sandbagLunges: 'Add walking lunges with load to build quad and glute endurance.',
    wallBalls: 'Do wall ball sets in planned chunks (e.g. 20s) while tired.',
  };
  return `${seg.label} slowed — ${tips[seg.key] ?? 'give it extra focus in training.'}`;
}

export function RaceAnalysis() {
  const { goals, today, readOnly } = useData();
  const { openProfile } = useUI();
  const races = completedRaces(goals, today);
  const [raceId, setRaceId] = useState<string | null>(null);
  const race = races.find((r) => r.id === raceId) ?? races[0];

  return (
    <Card>
      <CardHeader icon={Trophy} title="Completed race analysis" subtitle="What improved and what slowed compared with your previous race" action={!readOnly && <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={openProfile}><Pencil size={13} /> Edit results</button>} />
      <div className="space-y-5 p-4 sm:p-5">
        {!race ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            <p>Completed races appear here once their date has passed.</p>
            {!readOnly && <button className="btn-ghost mt-3" onClick={openProfile}>Add a past race</button>}
          </div>
        ) : (
          <>
            {races.length > 1 && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {races.map((r) => (
                  <button key={r.id} onClick={() => setRaceId(r.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${r.id === race.id ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                    {r.name} · {r.date.slice(0, 4)}
                  </button>
                ))}
              </div>
            )}
            <RaceResultView race={race} previous={previousRace(race, races)} />
          </>
        )}
      </div>
    </Card>
  );
}

function RaceResultView({ race, previous }: { race: Race; previous?: Race }) {
  const { goals, readOnly } = useData();
  const { openProfile } = useUI();
  const totals = resultTotals(race);
  const cmp = previous ? compareRaces(race, previous) : null;
  const improved = cmp ? cmp.segments.filter((s) => s.deltaSec < -2).sort((a, b) => a.deltaSec - b.deltaSec) : [];
  const slowed = cmp ? cmp.segments.filter((s) => s.deltaSec > 2).sort((a, b) => b.deltaSec - a.deltaSec) : [];
  const finish = cmp?.totals.find((t) => t.key === 'total');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 sm:p-4">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <p className="text-base font-semibold text-slate-900">{race.name}</p>
          <p className="text-sm text-slate-600">{raceTypeLabel(race, goals.athleteSex)}</p>
          {teamLabel(race) && <p className="text-sm font-medium text-violet-700">{teamLabel(race)}</p>}
          <p className="text-xs text-slate-500">{fmtLong(race.date)}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Finish time</p>
          <p className="text-2xl font-semibold tracking-tight text-slate-900">{totals.totalSec ? fmtTime(totals.totalSec) : '—'}</p>
          {finish && <TrendBadge delta={-finish.deltaSec} label={`${signed(finish.deltaSec)} vs ${previous!.name}`} />}
        </div>
      </div>

      {!totals.totalSec && !totals.hasSplits && (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center">
          <p className="text-sm text-slate-600">No result entered for this race yet.</p>
          {!readOnly && <button className="btn-primary mt-3" onClick={openProfile}>Add finish time</button>}
        </div>
      )}

      {cmp && cmp.totals.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cmp.totals.map((t) => (
            <div key={t.key} className="rounded-xl bg-white p-3 ring-1 ring-inset ring-slate-200">
              <p className="text-[11px] font-medium text-slate-500">{t.label}</p>
              <p className="text-base font-semibold text-slate-900">{fmtTime(t.currentSec)}</p>
              <p className={`text-xs font-medium ${t.deltaSec < 0 ? 'text-emerald-700' : t.deltaSec > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                {t.deltaSec === 0 ? 'same' : `${signed(t.deltaSec)} ${t.deltaSec < 0 ? 'faster' : 'slower'}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {previous && previous.format !== race.format && <p className="text-xs text-amber-700">Compared with {previous.name} ({raceTypeLabel(previous, goals.athleteSex)}) — a different format, so treat differences with care.</p>}
      {!previous && (totals.totalSec || totals.hasSplits) && <p className="text-xs text-slate-500">This is your first recorded race — add another completed race to see what improved and what slowed.</p>}

      {cmp && cmp.segments.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DeltaList title="What improved" icon={TrendingUp} tone="good" items={improved} empty="No segment was more than 2 s faster." />
            <DeltaList title="What slowed" icon={TrendingDown} tone="bad" items={slowed} empty="Nothing slowed by more than 2 s — great consistency." />
          </div>
          {slowed[0] && <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800"><b className="font-semibold">Focus next:</b> {tipFor(slowed[0], slowed)}</p>}

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Change per segment vs {previous!.name}</h4>
              <Legend items={[{ label: 'Faster', color: FASTER }, { label: 'Slower', color: SLOWER }]} />
            </div>
            <div style={{ height: Math.max(220, cmp.segments.length * 22 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cmp.segments} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke="#eef2f7" horizontal={false} />
                  <XAxis type="number" {...AXIS} tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}s`} />
                  <YAxis type="category" dataKey="label" {...AXIS} width={112} interval={0} tick={{ fill: '#334155', fontSize: 11 }} />
                  <ReferenceLine x={0} stroke="#94a3b8" />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9' }}
                    content={({ active, payload }) => {
                      const d = payload?.[0]?.payload as SegmentDelta | undefined;
                      if (!active || !d) return null;
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                          <p className="font-medium text-slate-900">{d.label}</p>
                          <p className="text-slate-600">{fmtTime(d.currentSec)} now · {fmtTime(d.previousSec)} before</p>
                          <p className={d.deltaSec <= 0 ? 'text-emerald-700' : 'text-rose-700'}>{signed(d.deltaSec)}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="deltaSec" name="Change" radius={4} barSize={12}>
                    {cmp.segments.map((s) => <Cell key={s.key} fill={s.deltaSec <= 0 ? FASTER : SLOWER} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {totals.hasSplits && <SplitTable race={race} previous={previous} />}
    </div>
  );
}

function DeltaList({ title, icon: Icon, tone, items, empty }: { title: string; icon: typeof TrendingUp; tone: 'good' | 'bad'; items: SegmentDelta[]; empty: string }) {
  return (
    <div className={`rounded-xl p-3 ${tone === 'good' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
      <p className={`mb-2 inline-flex items-center gap-1.5 text-sm font-semibold ${tone === 'good' ? 'text-emerald-800' : 'text-rose-800'}`}>
        <Icon size={15} /> {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-600">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 5).map((s) => (
            <li key={s.key} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{s.label}</span>
              <span className={`font-semibold ${tone === 'good' ? 'text-emerald-700' : 'text-rose-700'}`}>{signed(s.deltaSec)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SplitTable({ race, previous }: { race: Race; previous?: Race }) {
  const prevHas = previous && resultTotals(previous).hasSplits;
  const cell = (cur?: number, prev?: number) => (
    <>
      <span className="font-medium text-slate-900">{cur ? fmtTime(cur) : '—'}</span>
      {prevHas && cur && prev ? <span className={`block text-[11px] ${cur < prev ? 'text-emerald-700' : cur > prev ? 'text-rose-700' : 'text-slate-400'}`}>{signed(cur - prev)}</span> : null}
    </>
  );
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Splits</h4>
      <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-sm">
        {raceStations(race).map((s) => {
          const x = race.result?.splits.find((y) => y.station === s.id);
          const p = previous?.result?.splits.find((y) => y.station === s.id);
          return (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{s.order}</span>
              <span className="min-w-0 flex-1 truncate text-slate-800">{STATION_BY_ID[s.id].name}</span>
              <span className="w-16 shrink-0 text-right text-xs"><span className="block text-[10px] uppercase tracking-wide text-slate-500">Run</span>{cell(x?.runSec, p?.runSec)}</span>
              <span className="w-16 shrink-0 text-right text-xs"><span className="block text-[10px] uppercase tracking-wide text-slate-500">Station</span>{cell(x?.stationSec, p?.stationSec)}</span>
            </li>
          );
        })}
        {race.result?.roxzoneSec && (
          <li className="flex items-center gap-3 px-3 py-2">
            <span className="h-6 w-6 shrink-0" />
            <span className="flex-1 text-slate-800">Roxzone</span>
            <span className="w-16 shrink-0 text-right text-xs">{cell(race.result.roxzoneSec, previous?.result?.roxzoneSec)}</span>
          </li>
        )}
      </ol>
    </div>
  );
}
