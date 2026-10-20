import { Flag, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { raceTypeLabel } from '../lib/analytics';
import { fmtLong } from '../lib/dates';

const SEEN_KEY = 'hyrox-dashboard.seen-tags';
const readSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

/** Pops up once for each race a teammate tagged you in. */
export function TaggedRacePrompt() {
  const { user } = useAuth();
  const { goals, readOnly } = useData();
  const { openProfile } = useUI();
  const [seen, setSeen] = useState<string[]>(readSeen);
  if (readOnly || !user) return null;
  const key = (id: string) => `${user.profile.id}:${id}`;
  const race = goals.races.find((r) => r.shared && r.shared.ownerId !== user.profile.id && !seen.includes(key(r.id)));
  if (!race) return null;

  const dismiss = () => {
    const list = [...seen, key(race.id)];
    setSeen(list);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-200)));
    } catch {
      /* storage unavailable: hidden for this visit only */
    }
  };
  const legs = race.format === 'relay' && race.relayStations.length ? ` You're down for ${race.relayStations.length} station${race.relayStations.length === 1 ? '' : 's'}.` : '';

  return (
    <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl" role="dialog" aria-label="Tagged in a race">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700"><Flag size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">You've been tagged in a race</p>
          <p className="text-sm text-slate-600">
            <b className="font-semibold text-slate-900">{race.shared!.ownerName}</b> added you to <b className="font-semibold text-slate-900">{race.name}</b> ({raceTypeLabel(race, goals.athleteSex)}, {fmtLong(race.date)}).{legs}
          </p>
        </div>
        <button className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" onClick={dismiss} aria-label="Dismiss"><X size={16} /></button>
      </div>
      <button className="btn-primary mt-3 w-full justify-center" onClick={() => { dismiss(); openProfile({ raceId: race.id }); }}>View race</button>
    </div>
  );
}
