import { Pause, Play, RotateCcw, Users, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Card, PageHeader, Segmented } from '../components/ui';
import { Race3DScene, raceLegs, webglAvailable, type Pace } from '../components/Race3DScene';
import { useRaceEstimate } from '../components/SimAnalysis';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import type { Race } from '../data/types';
import { raceTypeLabel, upcomingRaces } from '../lib/analytics';
import { fmtShort } from '../lib/dates';
import { fmtTime } from '../lib/format';

type Format = 'solo' | 'doubles';

/** Live 3D view of a HYROX race: best and average time for every run and station, and the estimated finish. */
export default function Race3D() {
  const { goals, today, athlete, readOnly } = useData();
  const { openProfile } = useUI();
  const [format, setFormat] = useState<Format>('solo');
  const upcoming = upcomingRaces(goals, today);
  // Doubles races with a tagged partner give a team estimate.
  const doublesRaces = upcoming.filter((r) => r.format === 'doubles' && r.teammates?.some((t) => t.id !== athlete.id));
  const [raceId, setRaceId] = useState<string | null>(null);
  const doublesRace = doublesRaces.find((r) => r.id === raceId) ?? doublesRaces[0];
  // Solo: your own times at the weights of your next race (Open if none).
  const soloRace = useMemo<Race>(
    () => ({ id: 'solo-estimate', name: 'Solo', date: today, format: 'solo', category: upcoming.find((r) => r.format !== 'relay')?.category ?? 'open', relayStations: [] }),
    [today, upcoming.find((r) => r.format !== 'relay')?.category],
  );

  return (
    <div>
      <PageHeader
        title="Race 3D"
        subtitle="A HYROX arena in 3D: the running track outside, the stations inside, with your best and average time for every run and station. Drag to rotate, pinch or scroll to zoom."
        actions={
          <Segmented
            size="md"
            value={format}
            onChange={setFormat}
            options={[{ value: 'solo', label: 'Solo' }, { value: 'doubles', label: 'Doubles' }]}
          />
        }
      />
      {format === 'solo' ? (
        <RaceView race={soloRace} label="Solo · your times" />
      ) : doublesRace ? (
        <>
          {doublesRaces.length > 1 && (
            <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {doublesRaces.map((r) => (
                <button key={r.id} onClick={() => setRaceId(r.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${r.id === doublesRace.id ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                  {r.name} · {fmtShort(r.date)}
                </button>
              ))}
            </div>
          )}
          <RaceView race={doublesRace} label={`${raceTypeLabel(doublesRace, goals.athleteSex)} · with ${doublesRace.teammates!.filter((t) => t.id !== athlete.id).map((t) => t.displayName).join(', ')}`} />
        </>
      ) : (
        <Card className="p-6 text-center">
          <Users className="mx-auto text-slate-300" size={32} />
          <p className="mt-2 text-sm font-medium text-slate-800">No doubles race with a partner yet</p>
          <p className="mt-1 text-sm text-slate-500">Add an upcoming Doubles race and tag your partner (a friend) to see your team's times here.</p>
          {!readOnly && <button className="btn-primary mt-4" onClick={openProfile}>Athlete & races</button>}
        </Card>
      )}
    </div>
  );
}

function RaceView({ race, label }: { race: Race; label: string }) {
  const team = useRaceEstimate(race);
  const [pace, setPace] = useState<Pace>('best');
  const [playing, setPlaying] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [clock, setClock] = useState<{ sec: number; what: string } | null>(null);
  const [finished, setFinished] = useState(false);
  const hasWebgl = useMemo(webglAvailable, []);
  const e = team?.estimate;
  // Rebuild the 3D scene only when the numbers change.
  const key = e ? JSON.stringify([e.rows, e.roxzone]) : '';
  const rows = useMemo(() => e?.rows ?? [], [key]);
  if (!team || !e) return null;
  const combined = team.partners.some((p) => p.estimate);
  const loading = race.format === 'doubles' && team.partners.some((p) => !p.estimate && !p.error);
  const finish = (p: Pace) => (p === 'best' ? e.fastSec : e.typicalSec);
  // Team times are averaged per split and in total, so they can differ by a few seconds: make the replay end on the estimate.
  const replayRoxzone = e.roxzone[pace] + finish(pace) - raceLegs(e.rows, e.roxzone[pace], pace).reduce((a, l) => a + l.sec, 0);

  const start = () => {
    if (finished || !clock) setPlayKey((k) => k + 1);
    setFinished(false);
    setPlaying(true);
  };
  const reset = () => {
    setPlaying(false);
    setFinished(false);
    setClock(null);
    setPlayKey((k) => k + 1);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-white sm:col-span-2">
          <p className="flex items-center gap-1.5 text-xs text-blue-100">{race.format === 'doubles' ? <Users size={13} /> : <User size={13} />} {label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{fmtTime(e.fastSec)} – {fmtTime(e.typicalSec)}</p>
          <p className="text-xs text-blue-100">
            Estimated {race.format === 'doubles' ? 'team' : 'solo'} finish: best splits → average splits{combined ? ' (average of you and your partner)' : ''}
            {loading ? ' · loading partner…' : ''}
          </p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Race clock{clock ? ` · ${clock.what}` : ''}</p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-slate-900">{fmtTime(clock?.sec ?? 0)}</p>
          <p className="text-xs text-slate-500">Replay at {pace === 'best' ? 'best' : 'average'} pace · finish {fmtTime(finish(pace))}</p>
        </div>
      </div>

      {team.partners.some((p) => p.error) && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{team.partners.find((p) => p.error)!.error}</p>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5">
          <button className="btn-primary py-1.5 text-xs" onClick={() => (playing ? setPlaying(false) : start())}>
            {playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> {clock && !finished ? 'Resume' : 'Play the race'}</>}
          </button>
          <button className="btn-ghost py-1.5 text-xs" onClick={reset} aria-label="Restart replay"><RotateCcw size={14} /> Reset</button>
          <Segmented value={pace} onChange={(p) => { setPace(p); reset(); }} options={[{ value: 'best', label: 'Best pace' }, { value: 'avg', label: 'Average pace' }]} />
          <span className="ml-auto hidden items-center gap-3 text-[11px] text-slate-500 sm:flex">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> You (replay)</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Station edge: gap avg vs best</span>
          </span>
        </div>
        <div className="h-[520px] sm:h-[560px]">
          {hasWebgl ? (
            <Race3DScene
              rows={rows}
              roxzoneSec={replayRoxzone}
              pace={pace}
              playing={playing}
              playKey={playKey}
              onTick={(sec, leg) => setClock({ sec, what: leg ? (leg.kind === 'run' ? `Run ${leg.index + 1}` : e.rows[leg.index].name) : 'Finish' })}
              onDone={() => { setPlaying(false); setFinished(true); }}
            />
          ) : (
            <p className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">3D isn't available in this browser. The table below has the same times.</p>
          )}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-2 font-medium">#</th>
              <th className="py-1.5 pr-2 font-medium">Station</th>
              <th className="px-2 py-1.5 text-right font-medium">Run best · avg</th>
              <th className="py-1.5 pl-2 text-right font-medium">Station best · avg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {e.rows.map((r, i) => (
              <tr key={r.station}>
                <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                <td className="py-2 pr-2 font-medium text-slate-800">{r.name}{r.assumed && <span className="ml-1 text-[11px] font-normal text-amber-700">target</span>}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-600">{fmtTime(r.run.best)} · {fmtTime(r.run.avg)}</td>
                <td className="py-2 pl-2 text-right tabular-nums text-slate-900">{fmtTime(r.station_.best)} · {fmtTime(r.station_.avg)}</td>
              </tr>
            ))}
            <tr>
              <td />
              <td className="py-2 pr-2 font-medium text-slate-800">Roxzone{!e.roxzone.n && <span className="ml-1 text-[11px] font-normal text-amber-700">assumed</span>}</td>
              <td />
              <td className="py-2 pl-2 text-right tabular-nums text-slate-900">{fmtTime(e.roxzone.best)} · {fmtTime(e.roxzone.avg)}</td>
            </tr>
          </tbody>
        </table>
        {e.notes.length > 0 && (
          <ul className="mt-3 space-y-1 text-[11px] text-slate-500">
            {e.notes.map((n) => <li key={n}>• {n}</li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}
