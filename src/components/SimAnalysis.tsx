import { Award, Flag, Info, Timer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { DEMO_TODAY, generateSample } from '../data/mockData';
import { STATION_BY_ID, simLabel } from '../data/stations';
import type { Profile, Race, UserData, Workout } from '../data/types';
import { type Best, type Performance, type RaceEstimate, combineEstimates, compareSim, completedRaces, hyroxPerformances, raceEstimate, raceTypeLabel, sortByDate, upcomingRaces } from '../lib/analytics';
import { diffDays, fmtLong } from '../lib/dates';
import { fmtTime } from '../lib/format';
import { Card, CardHeader, MiniStat, TrendBadge } from './ui';

const signed = (sec: number) => `${sec > 0 ? '+' : sec < 0 ? '−' : '±'}${fmtTime(Math.abs(sec))}`;

/** All sims and completed races, as full-distance equivalents. */
export function usePerformances() {
  const { workouts, goals, today } = useData();
  return useMemo(() => hyroxPerformances(workouts, completedRaces(goals, today)), [workouts, goals, today]);
}

/** Teammates' data, loaded once per session (friends can read each other's dashboards). */
const teammateCache = new Map<string, Promise<UserData | null>>();

/** A tagged partner's sims and completed races. */
function partnerPerformances(data: UserData, partnerId: string, myRaces: Race[]): Performance[] {
  const workouts = [...generateSample(data.sample).workouts, ...data.added];
  // Their own races, plus completed shared races with them that you can see.
  const races = [...data.goals.races, ...myRaces.filter((r) => r.shared && r.teammates?.some((t) => t.id === partnerId))].filter((r) => r.date < DEMO_TODAY);
  return hyroxPerformances(workouts, races);
}

interface TeamEstimate {
  /** Shown estimate: the team average for tagged doubles, otherwise your own. */
  estimate: RaceEstimate;
  mine: RaceEstimate;
  partners: { profile: Profile; estimate?: RaceEstimate; error?: string }[];
}

/** Race estimate; for doubles with a tagged partner, the average of both athletes' estimates. */
export function useRaceEstimate(race: Race): TeamEstimate | null {
  const { backend } = useAuth();
  const { goals, athlete } = useData();
  const performances = usePerformances();
  const partners = race.format === 'doubles' ? (race.teammates ?? []).filter((t) => t.id !== athlete.id) : [];
  const key = partners.map((p) => p.id).join(',');
  const [loaded, setLoaded] = useState<Record<string, UserData | null | 'error'>>({});
  useEffect(() => {
    let live = true;
    for (const p of partners) {
      if (!teammateCache.has(p.id)) teammateCache.set(p.id, backend.loadUserData(p.id).catch(() => { teammateCache.delete(p.id); return Promise.reject(); }));
      teammateCache.get(p.id)!.then(
        (d) => live && setLoaded((x) => ({ ...x, [p.id]: d })),
        () => live && setLoaded((x) => ({ ...x, [p.id]: 'error' })),
      );
    }
    return () => {
      live = false;
    };
  }, [backend, key]);
  return useMemo(() => {
    if (race.format === 'relay') return null;
    const mine = raceEstimate(race, performances);
    const team = partners.map((profile) => {
      const d = loaded[profile.id];
      if (d === undefined) return { profile };
      if (d === 'error' || d === null) return { profile, error: `${profile.displayName}'s results aren't available, so this uses yours only.` };
      return { profile, estimate: raceEstimate(race, partnerPerformances(d, profile.id, goals.races)) };
    });
    const ready = team.filter((t) => t.estimate).map((t) => t.estimate!);
    if (!ready.length) return { estimate: mine, mine, partners: team };
    // Notes say whose data they are about.
    const notes = [mine, ...team.filter((t) => t.estimate).map((t) => t.estimate!)].flatMap((e, i) =>
      e.notes.map((n) => (i === 0 ? `You: ${n}` : `${team.filter((t) => t.estimate)[i - 1].profile.displayName}: ${n.replace(/\byour\b/g, 'their')}`)),
    );
    return { estimate: { ...combineEstimates([mine, ...ready]), notes }, mine, partners: team };
  }, [race, performances, loaded, key, goals.races]);
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
    <Card className="scroll-mt-20" id="race-estimate">
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
  const { goals, today, athlete } = useData();
  const team = useRaceEstimate(race)!;
  const e = team.estimate;
  const combined = team.partners.some((p) => p.estimate);
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-white">
        <p className="text-xs text-blue-100">{raceTypeLabel(race, goals.athleteSex)} · {fmtLong(race.date)} · {diffDays(race.date, today)} days to go</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{fmtTime(e.fastSec)} – {fmtTime(e.typicalSec)}</p>
        <p className="text-xs text-blue-100">
          {combined
            ? `Team estimate: average of both best times → average of both average times`
            : `best splits → average splits · from ${e.basis.sims} sim${e.basis.sims === 1 ? '' : 's'} and ${e.basis.races} race${e.basis.races === 1 ? '' : 's'}`}
        </p>
      </div>
      {team.partners.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {[{ profile: athlete, estimate: team.mine, error: undefined as string | undefined }, ...team.partners].map((p, i) => (
            <div key={p.profile.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{i === 0 ? `${p.profile.displayName} (you)` : p.profile.displayName}</p>
              <p className="mt-0.5 text-base font-semibold text-slate-900">{p.estimate ? `${fmtTime(p.estimate.fastSec)} – ${fmtTime(p.estimate.typicalSec)}` : p.error ? '—' : 'Loading…'}</p>
              <p className="text-xs text-slate-500">{p.estimate ? `best → average · ${p.estimate.basis.sims} sim${p.estimate.basis.sims === 1 ? '' : 's'}, ${p.estimate.basis.races} race${p.estimate.basis.races === 1 ? '' : 's'}` : p.error}</p>
            </div>
          ))}
        </div>
      )}
      <div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-2 font-medium">{combined ? 'Team average' : 'Station'}</th>
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

/** One-line estimated finish range for the race plan summary (solo and doubles only). */
export function EstimateLine({ race }: { race: Race }) {
  const team = useRaceEstimate(race);
  if (!team) return null;
  const e = team.estimate;
  const combined = team.partners.some((p) => p.estimate);
  return (
    <a href="#race-estimate" onClick={(ev) => { ev.preventDefault(); document.getElementById('race-estimate')?.scrollIntoView({ behavior: 'smooth' }); }} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2 py-1 text-sm text-blue-800 hover:bg-blue-100">
      <Timer size={14} className="shrink-0" />
      {combined ? 'Team estimate' : 'Estimated finish'} <b className="font-semibold">{fmtTime(e.fastSec)} – {fmtTime(e.typicalSec)}</b>
    </a>
  );
}
