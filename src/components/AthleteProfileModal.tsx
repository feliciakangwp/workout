import { ChevronDown, Flag, LogOut, Plus, Trash2, Trophy, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { STATIONS } from '../data/stations';
import type { Profile, Race, RaceFormat, RaceResult, Sex, StationId, WeightCategory } from '../data/types';
import { useAuth } from '../context/AuthContext';
import { raceStations, raceSummary, raceTypeLabel } from '../lib/analytics';
import { addDays, diffDays, fmtLong } from '../lib/dates';
import { fmtTime, parseTime } from '../lib/format';
import { Modal, Segmented } from './ui';

let raceKey = 0;
const newRace = (date: string): Race => ({ id: `race-new-${raceKey++}`, name: '', date, format: 'solo', category: 'open', relayStations: [] });

/** Text inputs for a completed race's result. */
interface ResultInputs {
  total: string;
  roxzone: string;
  splits: Record<StationId, { run: string; station: string }>;
  open: boolean;
}

const toInputs = (r?: RaceResult): ResultInputs => ({
  total: r?.totalSec ? fmtTime(r.totalSec) : '',
  roxzone: r?.roxzoneSec ? fmtTime(r.roxzoneSec) : '',
  splits: Object.fromEntries(
    STATIONS.map((s) => {
      const x = r?.splits.find((y) => y.station === s.id);
      return [s.id, { run: x?.runSec ? fmtTime(x.runSec) : '', station: x?.stationSec ? fmtTime(x.stationSec) : '' }];
    }),
  ) as ResultInputs['splits'],
  open: false,
});

/** Accepts h:mm:ss, m:ss or m.ss. */
const parse = (t: string) => parseTime(t.trim().replace(/\./g, ':'));

/** Live totals from the inputs; the finish time is automatic once every split and the Roxzone are filled. */
function liveTotals(race: Race, inp: ResultInputs) {
  const stations = raceStations(race);
  let run = 0;
  let station = 0;
  let filled = 0;
  for (const s of stations) {
    const r = parse(inp.splits[s.id].run);
    const st = parse(inp.splits[s.id].station);
    if (r > 0) run += r;
    if (st > 0) station += st;
    if (r > 0 && st > 0) filled++;
  }
  const rox = parse(inp.roxzone);
  const missing = stations.length - filled;
  const auto = rox > 0 && missing === 0;
  return { run, station, rox, missing, auto, total: auto ? run + station + rox : parse(inp.total) };
}

export function AthleteProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { goals, updateGoals, today, athlete } = useData();
  const { backend } = useAuth();
  const [friends, setFriends] = useState<Profile[]>([]);
  useEffect(() => {
    if (open) backend.listFriendships().then((l) => setFriends(l.filter((f) => f.status === 'friends').map((f) => f.profile))).catch(() => setFriends([]));
  }, [open, backend]);
  const isOwner = (r: Race) => !r.shared || r.shared.ownerId === athlete.id;
  const [sex, setSex] = useState<Sex>(goals.athleteSex);
  const [races, setRaces] = useState<Race[]>(goals.races);
  const [results, setResults] = useState<Record<string, ResultInputs>>({});
  const [errors, setErrors] = useState<string[]>([]);

  // Start from the saved profile each time the editor opens.
  useEffect(() => {
    if (!open) return;
    setSex(goals.athleteSex);
    setRaces(goals.races.map((r) => ({ ...r, relayStations: [...r.relayStations] })));
    setResults(Object.fromEntries(goals.races.map((r) => [r.id, toInputs(r.result)])));
    setErrors([]);
  }, [open, goals]);

  const update = (id: string, patch: Partial<Race>) => setRaces((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const updateResult = (id: string, patch: Partial<ResultInputs>) => setResults((rs) => ({ ...rs, [id]: { ...(rs[id] ?? toInputs()), ...patch } }));

  const upcoming = races.filter((r) => !r.date || r.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const completed = races.filter((r) => r.date && r.date < today).sort((a, b) => (a.date < b.date ? 1 : -1));

  const save = () => {
    const errs: string[] = [];
    const saved = races.map((r, i) => {
      const n = r.name.trim() || `Race ${i + 1}`;
      if (!r.name.trim()) errs.push(`Race ${i + 1}: enter a race name.`);
      if (!r.date) errs.push(`${n}: choose a date.`);
      if (r.format === 'relay' && r.relayStations.length === 0) errs.push(`${n}: pick at least one relay station.`);
      const team = r.teammates?.length ?? 0;
      if (r.format === 'doubles' && team > 1) errs.push(`${n}: a doubles race has one partner — remove the extra teammate.`);
      if (r.format === 'relay' && team > 3) errs.push(`${n}: a relay team has up to 3 teammates besides you.`);
      const race: Race = { ...r, name: r.name.trim(), result: undefined };
      const inp = results[r.id];
      if (r.date >= today || !inp) return race;
      // Completed race: turn the text inputs into a result.
      const check = (text: string, label: string, min: number, max: number) => {
        if (!text.trim()) return undefined;
        const v = parse(text);
        if (!(v >= min && v <= max)) errs.push(`${n}: ${label} should be a time like ${max > 3600 ? '1:28:45' : '5:20'}.`);
        return v;
      };
      const splits = raceStations(r).map((s) => ({
        station: s.id,
        runSec: check(inp.splits[s.id].run, `run before ${s.name}`, 120, 1200),
        stationSec: check(inp.splits[s.id].station, s.name, 10, 2400),
      }));
      const roxzoneSec = check(inp.roxzone, 'Roxzone', 10, 3600);
      const t = liveTotals(r, inp);
      const totalSec = t.auto ? t.total : check(inp.total, 'finish time', 60, 6 * 3600);
      const hasAny = totalSec || roxzoneSec || splits.some((x) => x.runSec || x.stationSec);
      return hasAny ? { ...race, result: { totalSec, roxzoneSec, splits: splits.filter((x) => x.runSec || x.stationSec) } } : race;
    });
    setErrors(errs);
    if (errs.length) return;
    updateGoals({ ...goals, athleteSex: sex, races: saved });
    onClose();
  };

  const raceCard = (r: Race, i: number, done: boolean) => {
    const summary = raceSummary(r, sex);
    const days = diffDays(r.date, today);
    return (
      <div key={r.id} className="rounded-xl border border-slate-200 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_170px_auto]">
          <div>
            <label className="label" htmlFor={`rn-${r.id}`}>Race name</label>
            <input id={`rn-${r.id}`} className="input" placeholder="e.g. HYROX Singapore" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor={`rd-${r.id}`}>Date</label>
            <input id={`rd-${r.id}`} type="date" className="input" value={r.date} onChange={(e) => update(r.id, { date: e.target.value })} />
          </div>
          <div className="flex items-end">
            {isOwner(r) ? (
              <button
                className="btn-ghost w-full justify-center text-rose-600 hover:bg-rose-50 sm:w-auto"
                onClick={() => (!r.shared || window.confirm(`Delete ${r.name || 'this race'} for everyone tagged in it?`)) && setRaces((rs) => rs.filter((x) => x.id !== r.id))}
                aria-label={`Remove race ${i + 1}`}
              >
                <Trash2 size={15} /> <span className="sm:hidden">Remove race</span>
              </button>
            ) : (
              <button
                className="btn-ghost w-full justify-center text-rose-600 hover:bg-rose-50 sm:w-auto"
                onClick={() => window.confirm(`Leave ${r.name || 'this race'}? It will be removed from your races; ${r.shared?.ownerName} keeps it.`) && setRaces((rs) => rs.filter((x) => x.id !== r.id))}
              >
                <LogOut size={15} /> Leave race
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
          <div>
            <p className="label">Format</p>
            <Segmented<RaceFormat>
              size="md"
              value={r.format}
              onChange={(format) => update(r.id, { format })}
              options={[...(isOwner(r) ? [{ value: 'solo' as const, label: 'Solo' }] : []), { value: 'doubles', label: 'Doubles' }, { value: 'relay', label: 'Relay' }]}
            />
          </div>
          <div>
            <p className="label">Weights</p>
            {r.format === 'relay' ? (
              <p className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600">Open (relay)</p>
            ) : (
              <Segmented<WeightCategory> size="md" value={r.category} onChange={(category) => update(r.id, { category })} options={[{ value: 'open', label: 'Open' }, { value: 'pro', label: 'Pro' }]} />
            )}
          </div>
        </div>

        {r.format === 'relay' && (
          <div className="mt-3">
            <p className="label">Your relay station(s)</p>
            <div className="flex flex-wrap gap-1.5">
              {STATIONS.map((s) => {
                const on = r.relayStations.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => update(r.id, { relayStations: on ? r.relayStations.filter((x) => x !== s.id) : [...r.relayStations, s.id] })}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}
                  >
                    {s.order}. {s.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">In a 4-person relay each athlete usually takes two run + station legs.</p>
          </div>
        )}

        {r.format !== 'solo' && <TeamFields race={r} friends={friends} owner={isOwner(r)} onChange={(teammates) => update(r.id, { teammates })} />}
        {r.format === 'solo' && (r.teammates?.length ?? 0) > 0 && <p className="mt-3 text-xs text-amber-700">Solo races have no teammates — your tagged friends will be removed when you save.</p>}

        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <b className="font-semibold">{raceTypeLabel(r, sex)}</b> · {summary.runKm} km running · {summary.stations} station{summary.stations === 1 ? '' : 's'}
          {r.date ? (days >= 0 ? ` · ${days} days to go` : ` · raced ${fmtLong(r.date)}`) : ''}
          {!done && <span className="block text-blue-700/80">{summary.note}</span>}
        </p>

        {done && <ResultFields race={r} inputs={results[r.id] ?? toInputs()} onChange={(patch) => updateResult(r.id, patch)} />}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Athlete & races"
      wide
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save</button>
        </>
      }
    >
      {errors.length > 0 && (
        <ul className="mb-4 list-disc space-y-0.5 rounded-lg bg-rose-50 py-2 pl-7 pr-3 text-xs text-rose-700" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <section>
        <h4 className="text-sm font-semibold text-slate-800">Athlete</h4>
        <p className="mb-2 text-xs text-slate-500">Sets the race weights for every race below.</p>
        <Segmented size="md" value={sex} onChange={setSex} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Flag size={15} className="text-blue-600" /> Upcoming races</h4>
          <button className="btn-ghost py-1.5 text-xs" onClick={() => setRaces((rs) => [...rs, newRace(today)])}>
            <Plus size={14} /> Add race
          </button>
        </div>
        {upcoming.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No upcoming race — that's fine. Add one whenever you enter a race.</p>}
        <div className="space-y-3">{upcoming.map((r) => raceCard(r, races.indexOf(r), false))}</div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Trophy size={15} className="text-amber-500" /> Completed races</h4>
          <button
            className="btn-ghost py-1.5 text-xs"
            onClick={() => {
              const race = newRace(addDays(today, -1));
              setRaces((rs) => [...rs, race]);
              updateResult(race.id, { open: true });
            }}
          >
            <Plus size={14} /> Add past race
          </button>
        </div>
        <p className="mb-2 mt-1 text-xs text-slate-500">Races move here automatically once their date has passed. Add past races with their date and finish time to see the race analysis on the HYROX page.</p>
        {completed.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No completed races yet.</p>}
        <div className="space-y-3">{completed.map((r) => raceCard(r, races.indexOf(r), true))}</div>
      </section>
    </Modal>
  );
}

function ResultFields({ race, inputs, onChange }: { race: Race; inputs: ResultInputs; onChange: (patch: Partial<ResultInputs>) => void }) {
  const t = liveTotals(race, inputs);
  const stations = raceStations(race);
  const setSplit = (id: StationId, key: 'run' | 'station', v: string) => onChange({ splits: { ...inputs.splits, [id]: { ...inputs.splits[id], [key]: v } } });

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Result</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor={`rt-${race.id}`}>Finish time</label>
          {t.auto ? (
            <div id={`rt-${race.id}`} className="input flex items-center justify-between bg-blue-50 font-semibold text-slate-900">
              {fmtTime(t.total)} <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">AUTO</span>
            </div>
          ) : (
            <input id={`rt-${race.id}`} inputMode="decimal" className="input" placeholder="1:28:45" value={inputs.total} onChange={(e) => onChange({ total: e.target.value })} />
          )}
        </div>
        <div>
          <label className="label" htmlFor={`rr-${race.id}`}>Roxzone</label>
          <input id={`rr-${race.id}`} inputMode="decimal" className="input" placeholder="7:30" value={inputs.roxzone} onChange={(e) => onChange({ roxzone: e.target.value })} />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        {t.auto
          ? 'Finish time = runs + stations + Roxzone.'
          : t.rox > 0
            ? `Fill the ${t.missing} remaining split${t.missing === 1 ? '' : 's'} below to calculate the finish time automatically, or enter it yourself.`
            : 'Enter your overall time, or add every split and the Roxzone time to calculate it automatically.'}
      </p>

      <button onClick={() => onChange({ open: !inputs.open })} className="mt-3 flex w-full items-center justify-between rounded-lg bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-800 ring-1 ring-inset ring-slate-200 hover:bg-slate-50" aria-expanded={inputs.open}>
        <span>
          Run & station splits <span className="font-normal text-slate-500">(optional)</span>
          {t.missing < stations.length && <span className="ml-1 text-xs font-normal text-slate-500">· {stations.length - t.missing}/{stations.length} filled</span>}
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition ${inputs.open ? 'rotate-180' : ''}`} />
      </button>

      {inputs.open && (
        <div className="mt-2 space-y-2">
          {stations.map((s) => (
            <div key={s.id} className="rounded-lg bg-white p-2.5 ring-1 ring-inset ring-slate-200">
              <p className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">{s.order}</span>
                {s.name}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input inputMode="decimal" className="input" placeholder="Run 1 km" aria-label={`Run before ${s.name}`} value={inputs.splits[s.id].run} onChange={(e) => setSplit(s.id, 'run', e.target.value)} />
                <input inputMode="decimal" className="input" placeholder={`${s.name} time`} aria-label={`${s.name} time`} value={inputs.splits[s.id].station} onChange={(e) => setSplit(s.id, 'station', e.target.value)} />
              </div>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-white p-2.5 text-center ring-1 ring-inset ring-slate-200">
            <div><p className="text-[11px] text-slate-500">Runs</p><p className="text-sm font-semibold">{fmtTime(t.run)}</p></div>
            <div><p className="text-[11px] text-slate-500">Stations</p><p className="text-sm font-semibold">{fmtTime(t.station)}</p></div>
            <div><p className="text-[11px] text-slate-500">Roxzone</p><p className="text-sm font-semibold">{t.rox > 0 ? fmtTime(t.rox) : '—'}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tag friends as doubles partner / relay teammates. Only the race's creator changes the team. */
function TeamFields({ race, friends, owner, onChange }: { race: Race; friends: Profile[]; owner: boolean; onChange: (t: Profile[]) => void }) {
  const team = race.teammates ?? [];
  const max = race.format === 'doubles' ? 1 : 3;
  const available = friends.filter((f) => !team.some((t) => t.id === f.id));
  return (
    <div className="mt-3 rounded-xl bg-violet-50 p-3">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-900">
        <Users size={14} /> {race.format === 'doubles' ? 'Doubles partner' : 'Relay teammates'}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {team.length === 0 && <span className="text-xs text-violet-800/80">No one tagged yet.</span>}
        {team.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-violet-900 ring-1 ring-inset ring-violet-200">
            {t.displayName}
            {race.shared?.ownerId === t.id && <span className="text-violet-500">· created</span>}
            {owner && (
              <button onClick={() => onChange(team.filter((x) => x.id !== t.id))} className="ml-0.5 rounded-full p-0.5 text-violet-400 hover:bg-violet-100 hover:text-violet-700" aria-label={`Untag ${t.displayName}`}>
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        {owner && team.length < max && (
          available.length ? (
            <select
              className="input h-8 w-auto py-0 text-xs"
              value=""
              aria-label="Tag a friend"
              onChange={(e) => {
                const f = friends.find((x) => x.id === e.target.value);
                if (f) onChange([...team, f]);
              }}
            >
              <option value="">+ Tag a friend…</option>
              {available.map((f) => (
                <option key={f.id} value={f.id}>{f.displayName}</option>
              ))}
            </select>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-violet-800/80"><UserPlus size={12} /> Add friends on the Friends page to tag them.</span>
          )
        )}
      </div>
      <p className="mt-2 text-[11px] text-violet-800/80">
        {owner
          ? 'Tagged friends see this race in their own races and can edit it too (each picks their own relay legs). Only you can change who is tagged.'
          : `Shared by ${race.shared?.ownerName}. You can edit this race; ${race.shared?.ownerName} manages who is tagged.`}
      </p>
    </div>
  );
}
