import { Award, Flag, Info, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { STATION_BY_ID, simLabel } from '../data/stations';
import type { Race, Workout } from '../data/types';
import { type Best, compareSim, completedRaces, hyroxPerformances, raceEstimate, raceTypeLabel, sortByDate, upcomingRaces } from '../lib/analytics';
import { diffDays, fmtLong } from '../lib/dates';
import { fmtTime } from '../lib/format';
import { Card, CardHeader, MiniStat, TrendBadge } from './ui';

const signed = (sec: number) => `${sec > 0 ? '+' : sec < 0 ? '−' : '±'}${fmtTime(Math.abs(sec))}`;

/** All sims and completed races, as full-distance equivalents. */
function usePerformances() {
  const { workouts, goals, today } = useData();
  return useMemo(() => hyroxPerformances(workouts, completedRaces(goals, today)), [workouts, goals, today]);
}

function Split({ label, sec, raw, best }: { label: string; sec?: number; raw?: string; best?: Best }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="min-w-0">
        <span className="text-slate-500">{label} </span>
        <b className="font-semibold text-slate-900">{sec ? fmtTime(sec) : '—'}</b>
        {raw && <span className="block text-[11px] text-slate-400">{raw}</span>}
        <span className="block truncate text-[11px] text-slate-500">{best ? `Best ${fmtTime(best.sec)} · ${best.from.label}` : 'No earlier result'}</span>
      </span>
      {sec && best ? (
        sec < best.sec ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><Award size={12} /> New best</span>
        ) : (
          <TrendBadge delta={sec - best.sec} label={signed(sec - best.sec)} good="down" />
        )
      ) : null}
    </div>
  );
}

/** A HYROX sim compared station by station with the best result from any other sim or race. */
export function SimComparison({ workout }: { workout: Workout }) {
  const performances = usePerformances();
  const c = useMemo(() => compareSim(workout, performances), [workout, performances]);
  const sim = workout.hyrox!.sim;
  const scaled = sim !== 'full';
  return (
    <div className="space-y-3">
      {c.insights.length > 0 && (
        <ul className="space-y-1.5 rounded-xl bg-blue-50/60 px-3 py-2.5 text-sm text-slate-700">
          {c.insights.map((t) => (
            <li key={t} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />{t}</li>
          ))}
        </ul>
      )}
      {!c.hasHistory && <p className="text-sm text-slate-500">This is your first sim or race with splits: the next one will be compared with it.</p>}
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label={scaled ? 'Full sim estimate' : 'Runs + stations'} value={c.estimatedSec ? fmtTime(c.estimatedSec) : '—'} sub={c.complete ? undefined : 'parts logged only'} />
        <MiniStat label="Best full effort" value={c.bestFull ? fmtTime(c.bestFull.sec) : '—'} sub={c.bestFull?.p.label} />
        <MiniStat label="All bests combined" value={c.combinedBest ? fmtTime(c.combinedBest) : '—'} sub="every split at its best" />
      </div>
      <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
        {c.rows.map((r) => (
          <li key={r.station} className="grid gap-x-4 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[9rem_1fr_1fr]">
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{STATION_BY_ID[r.station].order}</span>
              <span className="text-sm font-medium text-slate-800">{r.name}</span>
            </span>
            <Split label="Run" sec={r.runSec} best={r.bestRun} />
            <Split label="Station" sec={r.stationSec} raw={scaled && r.rawStationSec ? `full-distance estimate · ${fmtTime(r.rawStationSec)} at ${simLabel(sim).replace(' Sim', '')}` : undefined} best={r.bestStation} />
          </li>
        ))}
      </ol>
      <p className="flex gap-1.5 text-[11px] text-slate-500">
        <Info size={12} className="mt-0.5 shrink-0" />
        Compared with your other sims, solo races and relay legs (doubles stations are shared, so not compared). Half and ¾ sims are scaled to full distance plus a fatigue allowance (stations +4% / +2%, runs +2% / +1%). Roxzone is not included.
      </p>
    </div>
  );
}

/** HYROX page: pick a sim and see its station-by-station comparison. */
export function SimAnalysisCard() {
  const { workouts } = useData();
  const sims = useMemo(() => sortByDate(workouts.filter((w) => w.hyrox)).reverse(), [workouts]);
  const [id, setId] = useState<string | null>(null);
  const sim = sims.find((w) => w.id === id) ?? sims[0];
  return (
    <Card>
      <CardHeader icon={Timer} title="HYROX sim analysis" subtitle="Each run and station against your best from any sim or race" />
      <div className="space-y-4 p-4 sm:p-5">
        {!sim ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Log a HYROX workout (Half, ¾ or Full Sim) to see it compared with your bests.</p>
        ) : (
          <>
            {sims.length > 1 && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {sims.map((w) => (
                  <button key={w.id} onClick={() => setId(w.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${w.id === sim.id ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                    {simLabel(w.hyrox!.sim)} · {fmtLong(w.date).replace(/^\w+, /, '')}
                  </button>
                ))}
              </div>
            )}
            <SimComparison workout={sim} />
          </>
        )}
      </div>
    </Card>
  );
}

/** Finish-time range for upcoming solo and doubles races. */
export function RaceEstimateCard() {
  const { goals, today } = useData();
  const races = upcomingRaces(goals, today).filter((r) => r.format !== 'relay');
  const [id, setId] = useState<string | null>(null);
  const race = races.find((r) => r.id === id) ?? races[0];
  return (
    <Card>
      <CardHeader icon={Flag} title="Race time estimate" subtitle="From your HYROX sims and races: average to best time for every run and station" />
      <div className="space-y-4 p-4 sm:p-5">
        {!race ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Add an upcoming solo or doubles race under Athlete & races to see an estimated finish time.</p>
        ) : (
          <>
            {races.length > 1 && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {races.map((r) => (
                  <button key={r.id} onClick={() => setId(r.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${r.id === race.id ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            <Estimate race={race} />
          </>
        )}
      </div>
    </Card>
  );
}

function Estimate({ race }: { race: Race }) {
  const { goals, today } = useData();
  const performances = usePerformances();
  const e = useMemo(() => raceEstimate(race, performances), [race, performances]);
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-white">
        <p className="text-xs text-blue-100">{raceTypeLabel(race, goals.athleteSex)} · {fmtLong(race.date)} · {diffDays(race.date, today)} days to go</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{fmtTime(e.fastSec)} – {fmtTime(e.typicalSec)}</p>
        <p className="text-xs text-blue-100">best splits → average splits · from {e.basis.sims} sim{e.basis.sims === 1 ? '' : 's'} and {e.basis.races} race{e.basis.races === 1 ? '' : 's'}</p>
      </div>
      <div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-2 font-medium">Station</th>
              <th className="px-2 py-1.5 text-right font-medium">Run before</th>
              <th className="py-1.5 pl-2 text-right font-medium">Station</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {e.rows.map((r) => (
              <tr key={r.station}>
                <td className="py-2 pr-2 font-medium text-slate-800">
                  {r.name}
                  {r.assumed && <span className="ml-1 text-[11px] font-normal text-amber-700">target</span>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-600">{fmtTime(r.run.best)} – {fmtTime(r.run.avg)}</td>
                <td className="py-2 pl-2 text-right tabular-nums text-slate-900">{fmtTime(r.station_.best)} – {fmtTime(r.station_.avg)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 pr-2 font-medium text-slate-800">Roxzone{!e.roxzone.n && <span className="ml-1 text-[11px] font-normal text-amber-700">assumed</span>}</td>
              <td />
              <td className="py-2 pl-2 text-right tabular-nums text-slate-900">{fmtTime(e.roxzone.best)} – {fmtTime(e.roxzone.avg)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {e.notes.length > 0 && (
        <ul className="space-y-1 text-[11px] text-slate-500">
          {e.notes.map((n) => (
            <li key={n} className="flex gap-1.5"><Info size={12} className="mt-0.5 shrink-0" />{n}</li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-slate-500">Times are best – average. Half and ¾ sims count as full-distance estimates. Station bests use your sims, solo races and relay legs{e.format === 'doubles' ? ', or your doubles race splits when you have them' : ''}.</p>
    </div>
  );
}
