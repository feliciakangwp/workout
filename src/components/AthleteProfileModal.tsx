import { ChevronDown, Flag, LogOut, Plus, Trash2, Trophy, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { STATIONS } from '../data/stations';
import { OTHER_LEG, type Profile, type Race, type RaceFormat, type RaceKind, type RaceResult, type RedlineDivision, type Sex, type StationId, type WeightCategory } from '../data/types';
import { REDLINE_LEVELS } from '../data/redline';
import { useAuth } from '../context/AuthContext';
import { RACE_KIND_LABEL, RUN_DISTANCES, isHyrox, legName, raceKind, raceSummary, raceTypeLabel, redlineFor, resultStations } from '../lib/analytics';
import { addDays, diffDays, fmtLong } from '../lib/dates';
import { fmtRange, fmtTime, parseTime } from '../lib/format';
import { Modal, Segmented } from './ui';
import { RedlineList } from './RacePlan';
import { useRunEstimate } from './SimAnalysis';
import type { ProfileTarget } from '../context/UIContext';

/** Unique across visits: a per-visit counter restarted at 0 and gave a new race the id of one saved earlier. */
const newRaceId = () => `race-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const newRace = (date: string): Race => ({ id: newRaceId(), name: '', date, format: 'solo', category: 'open', relayStations: [] });

/** Gives each race a unique id, repairing races saved with a clashing id by the old counter. */
function uniqueIds(races: Race[]): Race[] {
  const seen = new Set<string>();
  return races.map((r) => {
    const id = seen.has(r.id) ? newRaceId() : r.id;
    seen.add(id);
    return id === r.id ? r : { ...r, id };
  });
}

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
const parse = parseTime;

/** Live totals from the inputs; the finish time is automatic once every split and the Roxzone are filled. */
function liveTotals(inp: ResultInputs) {
  const stations = resultStations();
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

export function AthleteProfileModal({ open, target, onClose }: { open: boolean; target?: ProfileTarget; onClose: () => void }) {
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

  /** Race to scroll to and highlight: a new one, or the one being edited. */
  const [focusId, setFocusId] = useState<string | null>(null);

  // Start from the saved profile each time the editor opens.
  useEffect(() => {
    if (!open) return;
    setSex(goals.athleteSex);
    const list = uniqueIds(goals.races).map((r) => ({ ...r, relayStations: [...r.relayStations] }));
    let focus: string | null = null;
    if (target && 'addRace' in target) {
      const race = newRace(target.addRace === 'past' ? addDays(today, -1) : today);
      list.push(race);
      focus = race.id;
    } else if (target) focus = target.raceId;
    setRaces(list);
    setResults(Object.fromEntries(list.map((r) => [r.id, toInputs(r.result)])));
    setFocusId(focus);
    setErrors([]);
    // Only when opening, not on every change to the saved goals.
  }, [open]);

  // Bring the new or chosen race into view, name field ready.
  useEffect(() => {
    if (!open || !focusId) return;
    const t = setTimeout(() => {
      const input = document.getElementById(`rn-${focusId}`) as HTMLInputElement | null;
      input?.closest('.rounded-xl')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (input && !input.value) input.focus({ preventScroll: true });
    }, 80);
    return () => clearTimeout(t);
  }, [open, focusId]);

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
      const kind = raceKind(r);
      if (kind === 'hyrox' && r.format === 'relay' && r.relayStations.length === 0) errs.push(`${n}: assign at least one relay station to yourself.`);
      if (kind === 'marathon' && !(r.distanceKm && r.distanceKm > 0 && r.distanceKm <= 400)) errs.push(`${n}: enter the race distance in km.`);
      const team = r.teammates?.length ?? 0;
      if (r.format === 'doubles' && team > 1) errs.push(`${n}: a doubles race has one partner — remove the extra teammate.`);
      if (r.format === 'relay' && team > 3) errs.push(`${n}: a relay team has up to 3 teammates besides you.`);
      const race: Race = { ...r, name: r.name.trim(), result: undefined, ...kindFields(r, sex) };
      const inp = results[r.id];
      if (r.date >= today || !inp) return race;
      if (kind !== 'hyrox') {
        // Redline, running and other races: the finish time only.
        const totalSec = inp.total.trim() ? parse(inp.total) : undefined;
        if (totalSec !== undefined && !(totalSec >= 60 && totalSec <= 48 * 3600)) errs.push(`${n}: finish time should be a time like ${kind === 'marathon' ? '3:45:00' : '1:05:30'}.`);
        return totalSec ? { ...race, result: { totalSec, splits: [] } } : race;
      }
      // Completed race: turn the text inputs into a result.
      const check = (text: string, label: string, min: number, max: number) => {
        if (!text.trim()) return undefined;
        const v = parse(text);
        if (!(v >= min && v <= max)) errs.push(`${n}: ${label} should be a time like ${max > 3600 ? '1:28:45' : '5:20'}.`);
        return v;
      };
      const splits = resultStations().map((s) => ({
        station: s.id,
        runSec: check(inp.splits[s.id].run, `run before ${s.name}`, 120, 1200),
        stationSec: check(inp.splits[s.id].station, s.name, 10, 2400),
      }));
      const roxzoneSec = check(inp.roxzone, 'Roxzone', 10, 3600);
      const t = liveTotals(inp);
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
      <div key={r.id} className={`scroll-mt-2 rounded-xl border p-3 sm:p-4 ${r.id === focusId ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}>
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

        <div className="mt-3">
          <p className="label">Race type</p>
          {isOwner(r) ? (
            <Segmented<RaceKind>
              size="md"
              value={raceKind(r)}
              onChange={(kind) => update(r.id, { kind, ...(kind === 'marathon' && !r.distanceKm ? { distanceKm: 42.195 } : {}) })}
              options={(['hyrox', 'redline', 'marathon', 'other'] as const).map((k) => ({ value: k, label: k === 'other' ? 'Other' : RACE_KIND_LABEL[k] }))}
            />
          ) : (
            <p className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600">{RACE_KIND_LABEL[raceKind(r)]}</p>
          )}
        </div>

        {raceKind(r) === 'redline' && <RedlineFields race={r} sex={sex} owner={isOwner(r)} onChange={(patch) => update(r.id, patch)} />}
        {raceKind(r) === 'marathon' && <DistanceFields race={r} onChange={(distanceKm) => update(r.id, { distanceKm })} />}
        {raceKind(r) === 'other' && <p className="mt-3 text-xs text-slate-500">Any other race: the name and date go on your race plan, and you can add your finish time once it's done.</p>}

        {isHyrox(r) && (<>
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

        {r.format !== 'solo' && <TeamFields race={r} friends={friends} owner={isOwner(r)} onChange={(teammates) => update(r.id, { teammates })} />}

        {r.format === 'relay' && <RelayLegs race={r} me={athlete} onChange={(legs) => update(r.id, { legs, relayStations: STATIONS.filter((s) => legs[s.id] === athlete.id).map((s) => s.id) })} />}
        </>)}
        {raceKind(r) === 'redline' && r.format !== 'solo' && <TeamFields race={r} friends={friends} owner={isOwner(r)} onChange={(teammates) => update(r.id, { teammates })} />}
        {(r.teammates?.length ?? 0) > 0 && (r.format === 'solo' || raceKind(r) === 'marathon' || raceKind(r) === 'other') && (
          <p className="mt-3 text-xs text-amber-700">{isHyrox(r) || raceKind(r) === 'redline' ? 'Solo races' : 'This race type'} has no teammates — your tagged friends will be removed when you save.</p>
        )}

        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <b className="font-semibold">{raceTypeLabel(r, sex)}</b>
          {isHyrox(r) && <> · {summary.runKm} km running · {summary.stations} station{summary.stations === 1 ? '' : 's'}</>}
          {raceKind(r) === 'redline' && <> · {summary.stations} stations</>}
          {r.date ? (days >= 0 ? ` · ${days} days to go` : ` · raced ${fmtLong(r.date)}`) : ''}
          {!done && summary.note && <span className="block text-blue-700/80">{summary.note}</span>}
          {!done && raceKind(r) === 'marathon' && <RunEstimateHint race={r} />}
        </p>

        {done && !isHyrox(r) && <FinishTimeField race={r} value={results[r.id]?.total ?? ''} onChange={(total) => updateResult(r.id, { total })} />}
        {done && isHyrox(r) && <ResultFields race={r} me={athlete} inputs={results[r.id] ?? toInputs()} onChange={(patch) => updateResult(r.id, patch)} />}
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
        <p className="mb-2 mt-1 text-xs text-slate-500">Races move here automatically once their date has passed. Add past races with their date and finish time to see the race analysis on the Race page.</p>
        {completed.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No completed races yet.</p>}
        <div className="space-y-3">{completed.map((r) => raceCard(r, races.indexOf(r), true))}</div>
      </section>
    </Modal>
  );
}

/** Fields that only belong to some race kinds are cleared, so a race changed from HYROX to a marathon doesn't keep relay legs. */
function kindFields(r: Race, sex: Sex): Partial<Race> {
  const kind = raceKind(r);
  const teamless = kind === 'marathon' || kind === 'other' || r.format === 'solo';
  const base: Partial<Race> = {
    distanceKm: kind === 'marathon' ? r.distanceKm : undefined,
    redline: kind === 'redline' ? (({ division, level }) => ({ division, level }))(redlineFor(r, sex)) : undefined,
    teammates: teamless ? undefined : r.teammates,
  };
  if (kind === 'hyrox') return base;
  return { ...base, format: kind === 'redline' ? r.format : 'solo', category: 'open', relayStations: [], legs: undefined };
}

/** Redline: format, level (singles) and division, with the station work for that category. */
function RedlineFields({ race, sex, owner, onChange }: { race: Race; sex: Sex; owner: boolean; onChange: (patch: Partial<Race>) => void }) {
  const { division, level, config } = redlineFor(race, sex);
  const set = (patch: Partial<NonNullable<Race['redline']>>) => onChange({ redline: { division, level, ...patch } });
  const solo = race.format === 'solo';
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div>
          <p className="label">Format</p>
          <Segmented<RaceFormat>
            size="md"
            value={race.format}
            onChange={(format) => onChange({ format, ...(format === 'solo' && division === 'mixed' ? { redline: { division: sex === 'female' ? 'women' : 'men', level } } : {}) })}
            options={[...(owner ? [{ value: 'solo' as const, label: 'Singles' }] : []), { value: 'doubles', label: 'Doubles' }, { value: 'relay', label: 'Team relay' }]}
          />
        </div>
        <div>
          <p className="label">Category</p>
          <Segmented<RedlineDivision>
            size="md"
            value={division}
            onChange={(d) => set({ division: d })}
            options={[{ value: 'women', label: 'Women' }, { value: 'men', label: 'Men' }, ...(solo ? [] : [{ value: 'mixed' as const, label: 'Mixed' }])]}
          />
        </div>
        {solo && (
          <div>
            <p className="label">Level</p>
            <Segmented<string> size="md" value={String(level)} onChange={(l) => set({ level: Number(l) as 1 | 2 | 3 })} options={REDLINE_LEVELS.map((l) => ({ value: String(l.level), label: l.label.replace('Level ', 'L').replace(' · ', ' ') }))} />
          </div>
        )}
      </div>
      <details className="mt-3 rounded-xl bg-rose-50/60 p-3" open>
        <summary className="cursor-pointer text-xs font-semibold text-rose-900">
          {config.label}: 12 stations
          {config.estimated && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">estimated loads</span>}
        </summary>
        <div className="mt-2"><RedlineList spec={config.spec} /></div>
        {config.note && <p className="mt-1.5 text-[11px] text-slate-600">{config.note}</p>}
      </details>
    </div>
  );
}

/** Running race distance: quick picks or any distance in km. */
function DistanceFields({ race, onChange }: { race: Race; onChange: (km: number | undefined) => void }) {
  const [text, setText] = useState(race.distanceKm ? String(race.distanceKm) : '');
  // Follow quick picks, but leave half-typed text like "21." alone.
  useEffect(() => setText((t) => (parseFloat(t.replace(',', '.')) === race.distanceKm ? t : race.distanceKm ? String(race.distanceKm) : '')), [race.distanceKm]);
  return (
    <div className="mt-3">
      <label className="label" htmlFor={`rk-${race.id}`}>Distance</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {RUN_DISTANCES.map((d) => (
          <button
            key={d.km}
            type="button"
            onClick={() => onChange(d.km)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${race.distanceKm && Math.abs(race.distanceKm - d.km) < 0.01 ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}
          >
            {d.label}
          </button>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <input
            id={`rk-${race.id}`}
            inputMode="decimal"
            className="input h-8 w-24 py-0 text-sm"
            placeholder="km"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const km = parseFloat(e.target.value.replace(',', '.'));
              onChange(km > 0 ? km : undefined);
            }}
          />
          <span className="text-xs text-slate-500">km</span>
        </span>
      </div>
    </div>
  );
}

function RunEstimateHint({ race }: { race: Race }) {
  const e = useRunEstimate(race);
  return <span className="block text-blue-700/80">{e ? `Estimated finish from your runs: ${fmtRange(e.fastSec, e.typicalSec)}` : 'Log a run of 3 km or more to see an estimated finish time.'}</span>;
}

function FinishTimeField({ race, value, onChange }: { race: Race; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Result</p>
      <label className="label mt-2" htmlFor={`rt-${race.id}`}>Finish time</label>
      <input id={`rt-${race.id}`} inputMode="decimal" className="input" placeholder={raceKind(race) === 'marathon' ? '3:45:00' : '1:05:30'} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ResultFields({ race, me, inputs, onChange }: { race: Race; me: Profile; inputs: ResultInputs; onChange: (patch: Partial<ResultInputs>) => void }) {
  const t = liveTotals(inputs);
  // Every station: a relay result is the whole team's.
  const stations = resultStations();
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
                {race.format === 'relay' && <span className="ml-auto text-xs font-normal text-slate-500">{legName(race, s.id, me)}</span>}
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

/** Relay: who does each station: you, a tagged teammate, or a teammate who isn't on the app. */
function RelayLegs({ race, me, onChange }: { race: Race; me: Profile; onChange: (legs: NonNullable<Race['legs']>) => void }) {
  const people = [{ id: me.id, name: 'You' }, ...(race.teammates ?? []).map((t) => ({ id: t.id, name: t.displayName })), { id: OTHER_LEG, name: 'Other teammate' }];
  // Older races only stored your own stations.
  const legs: NonNullable<Race['legs']> = race.legs ?? Object.fromEntries(race.relayStations.map((s) => [s, me.id]));
  const valid = new Set(people.map((p) => p.id));
  return (
    <div className="mt-3">
      <p className="label">Relay legs: who runs each station</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {STATIONS.map((s) => {
          const who = legs[s.id] && valid.has(legs[s.id]!) ? legs[s.id]! : '';
          return (
            <label key={s.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 ring-inset ${who === me.id ? 'bg-blue-50 ring-blue-200' : 'bg-white ring-slate-200'}`}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">{s.order}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{s.name}</span>
              <select className="input h-8 w-36 shrink-0 py-0 text-xs" aria-label={`Who does ${s.name}`} value={who} onChange={(e) => onChange({ ...legs, [s.id]: e.target.value || undefined })}>
                <option value="">Not set</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Each person does the 1 km run before their station. Tag teammates above to pick them here; they see their own legs in their races. "Other teammate" is someone not on the app.</p>
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
          ? 'Tagged friends see this race in their own races and can edit it too. Only you can change who is tagged.'
          : `Shared by ${race.shared?.ownerName}. You can edit this race; ${race.shared?.ownerName} manages who is tagged.`}
      </p>
    </div>
  );
}
