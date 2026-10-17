import { CalendarClock, Flag, Footprints, Pencil, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import type { MuscleGroup, Race } from '../data/types';
import { COVERAGE_META, type FocusLevel, muscleCoverage, raceMuscleFocus, raceSegments, raceSummary, raceTypeLabel, teamLabel, upcomingRaces } from '../lib/analytics';
import { diffDays, fmtLong } from '../lib/dates';
import { BodyFigure } from './BodyMap';
import { Card, CardHeader, Legend } from './ui';

export const FOCUS_META: Record<FocusLevel, { label: string; color: string }> = {
  primary: { label: 'Primary focus', color: '#1c5cab' },
  secondary: { label: 'Secondary focus', color: '#86b6ef' },
  low: { label: 'Low demand', color: '#e2e8f0' },
};

/** Race picker shared by pages that show race-specific content. */
export function useRaceSelection() {
  const { goals, today } = useData();
  const races = upcomingRaces(goals, today);
  const [raceId, setRaceId] = useState<string | null>(null);
  const race = races.find((r) => r.id === raceId) ?? races[0];
  return { races, race, setRaceId };
}

export function RaceTabs({ races, race, onChange }: { races: Race[]; race?: Race; onChange: (id: string) => void }) {
  if (races.length < 2) return null;
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {races.map((r) => (
        <button key={r.id} onClick={() => onChange(r.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${r.id === race?.id ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
          {r.name}
        </button>
      ))}
    </div>
  );
}

export function NoRaces() {
  const { openProfile } = useUI();
  const { readOnly } = useData();
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-700">No upcoming race planned</p>
      <p className="mt-1 text-xs text-slate-500">That's fine — train as usual. If you enter a race later, its demands and muscle focus will appear here.</p>
      {!readOnly && <button className="btn-ghost mt-3" onClick={openProfile}>Add a race</button>}
    </div>
  );
}

/** Full race plan: race demands, the athlete's share and muscle focus. */
export function RacePlan() {
  const { goals, workouts, today, readOnly } = useData();
  const { openProfile } = useUI();
  const { races, race, setRaceId } = useRaceSelection();
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const [hovered, setHovered] = useState<MuscleGroup | null>(null);
  const coverage = useMemo(() => muscleCoverage(workouts, '4w', today), [workouts, today]);

  if (!race) {
    return (
      <Card>
        <CardHeader icon={Flag} title="Race plan" subtitle="Race demands and muscle focus" />
        <div className="p-5"><NoRaces /></div>
      </Card>
    );
  }

  const sex = goals.athleteSex;
  const segments = raceSegments(race, sex);
  const summary = raceSummary(race, sex);
  const focus = raceMuscleFocus(race, sex);
  const colors = Object.fromEntries(focus.map((f) => [f.id, FOCUS_META[f.level].color])) as Record<MuscleGroup, string>;
  const focusList = focus.filter((f) => f.level !== 'low');
  const active = focus.find((f) => f.id === (hovered ?? selected));
  const days = diffDays(race.date, today);

  return (
    <Card>
      <CardHeader icon={Flag} title="Race plan" subtitle="What your race demands from you, and where to focus training" action={!readOnly && <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={openProfile}><Pencil size={13} /> Edit races</button>} />
      <div className="space-y-5 p-4 sm:p-5">
        <RaceTabs races={races} race={race} onChange={setRaceId} />

        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 sm:p-4">
          <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
            <p className="text-base font-semibold text-slate-900">{race.name}</p>
            <p className="text-sm text-slate-600">{raceTypeLabel(race, sex)}</p>
            {teamLabel(race) && <p className="text-sm font-medium text-violet-700">{teamLabel(race)}</p>}
            <p className="mt-0.5 text-xs text-slate-500">{fmtLong(race.date)}</p>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
            <Pill icon={CalendarClock} value={String(Math.max(0, days))} label="days to go" />
            <Pill icon={Footprints} value={`${summary.runKm} km`} label="your running" />
            <Pill icon={Users} value={String(summary.stations)} label={race.format === 'doubles' ? 'shared stations' : 'stations'} />
          </div>
          <p className="w-full text-xs text-slate-600">{summary.note}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Race segments</h4>
            <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
              {segments.map((s) => (
                <li key={s.station} className={`flex items-center gap-3 px-3 py-2.5 ${s.included ? '' : 'bg-slate-50 text-slate-400'}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.included ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{s.order}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${s.included ? 'text-slate-900' : 'text-slate-500'}`}>1 km run → {s.name}</p>
                    <p className="text-xs text-slate-500">{s.spec}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${!s.included ? 'bg-slate-100 text-slate-500' : s.share < 1 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {!s.included ? 'Teammate' : s.share < 1 ? 'Run + shared' : 'Run + station'}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Muscle groups to focus on</h4>
            {race.format !== 'relay' && <p className="mb-2 text-xs text-slate-600">A {race.format === 'doubles' ? 'doubles' : 'solo'} race covers all 8 stations, so every muscle group is a focus.</p>}
            <Legend items={(['primary', 'secondary', 'low'] as const).map((l) => ({ label: FOCUS_META[l].label, color: FOCUS_META[l].color }))} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['front', 'back'] as const).map((v) => (
                <div key={v} className="flex flex-col items-center">
                  <div className="h-[260px] w-full max-w-[150px]">
                    <BodyFigure view={v} colors={colors} selected={selected} hovered={hovered} onSelect={setSelected} onHover={setHovered} />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{v}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 min-h-[2.5rem] rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {active ? (
                <>
                  <b className="font-semibold text-slate-900">{active.label}</b> · {FOCUS_META[active.level].label.toLowerCase()} ({active.score}/100)
                  {active.sources.length > 0 && <> · used in {active.sources.join(', ')}</>}
                </>
              ) : (
                'Tap a muscle group to see which race segments use it.'
              )}
            </p>
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Focus vs your current training (4-week coverage)</h4>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {focusList.map((f) => {
              const cov = coverage.find((c) => c.id === f.id)!;
              const prioritise = cov.status === 'below' || cov.status === 'significant';
              return (
                <li key={f.id}>
                  <button onClick={() => setSelected(f.id)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:bg-slate-50 ${selected === f.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                    <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: FOCUS_META[f.level].color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">{f.label}</span>
                      <span className="block truncate text-xs text-slate-500">{f.sources.slice(0, 3).join(', ') || 'Supporting muscle'}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block text-xs font-medium ${COVERAGE_META[cov.status].text}`}>{cov.pct}% of target</span>
                      {prioritise && <span className="mt-0.5 inline-block rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">PRIORITISE</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function Pill({ icon: Icon, value, label }: { icon: typeof Flag; value: string; label: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-center shadow-sm ring-1 ring-slate-200">
      <p className="inline-flex items-center gap-1 text-base font-semibold text-slate-900"><Icon size={13} className="text-blue-600" />{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

/** Compact race focus summary for the Muscle Analysis page. */
export function RaceFocusStrip({ onSelect }: { onSelect: (m: MuscleGroup) => void }) {
  const { goals, workouts, today } = useData();
  const { races, race, setRaceId } = useRaceSelection();
  const coverage = useMemo(() => muscleCoverage(workouts, '4w', today), [workouts, today]);
  if (!race) return null;
  const focus = raceMuscleFocus(race, goals.athleteSex).filter((f) => f.level !== 'low');
  const fullBody = race.format !== 'relay';
  return (
    <Card className="mb-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Race focus</p>
          <p className="text-sm font-semibold text-slate-900">{race.name} · {raceTypeLabel(race, goals.athleteSex)}</p>
        </div>
        <RaceTabs races={races} race={race} onChange={setRaceId} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {focus.map((f) => {
          const cov = coverage.find((c) => c.id === f.id)!;
          const prioritise = cov.status === 'below' || cov.status === 'significant';
          return (
            <button key={f.id} onClick={() => onSelect(f.id)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${prioritise ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-blue-50 text-blue-700 ring-blue-200'}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: FOCUS_META[f.level].color }} />
              {f.label}
              {prioritise && <span className="font-semibold">· prioritise</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {fullBody ? 'Full race — every muscle group is a focus.' : 'Relay — focus on the muscle groups your legs use. Dark blue = primary (shown in bold below while your only upcoming races are relays), light blue = secondary.'} Red chips are below their training target.
      </p>
    </Card>
  );
}
