import { Check, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFriendRequests } from '../context/FriendRequestsContext';
import { useUI } from '../context/UIContext';
import type { PageId } from './Layout';

const SEEN_KEY = 'hyrox-dashboard.seen-requests';
const readSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

/**
 * Pops up when someone sends you a friend request, with Accept / Decline.
 * "Later" hides it for that request; it stays on the Friends page and badge.
 */
export function FriendRequestPrompt({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const { backend, user } = useAuth();
  const { incoming, refresh } = useFriendRequests();
  const { notify } = useUI();
  const [seen, setSeen] = useState<string[]>(readSeen);
  const [busy, setBusy] = useState(false);
  const key = (id: string) => `${user?.profile.id}:${id}`;
  const next = incoming.find((p) => !seen.includes(key(p.id)));
  if (!next) return null;

  const later = () => {
    const list = [...seen, key(next.id)];
    setSeen(list);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-100)));
    } catch {
      /* storage unavailable: hidden for this visit only */
    }
  };
  const act = async (accept: boolean) => {
    setBusy(true);
    try {
      if (accept) await backend.acceptFriend(next.id);
      else await backend.removeFriend(next.id);
      notify(accept ? `You and ${next.displayName} are now friends.` : 'Request declined.');
    } catch (e) {
      notify(`Couldn't update the request: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl" role="dialog" aria-label="Friend request">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><UserPlus size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Friend request</p>
          <p className="text-sm text-slate-600"><b className="font-semibold text-slate-900">{next.displayName}</b> wants to be friends. Friends can view each other's dashboards (not weight) and tag each other in races.</p>
        </div>
        <button className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" onClick={later} aria-label="Later"><X size={16} /></button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button className="btn-primary flex-1 justify-center" disabled={busy} onClick={() => act(true)}><Check size={15} /> Accept</button>
        <button className="btn-ghost flex-1 justify-center" disabled={busy} onClick={() => act(false)}>Decline</button>
      </div>
      {incoming.length > 1 && (
        <button className="mt-2 w-full text-center text-xs font-medium text-blue-600 hover:text-blue-700" onClick={() => { later(); onNavigate('friends'); }}>
          See all {incoming.length} requests →
        </button>
      )}
    </div>
  );
}
