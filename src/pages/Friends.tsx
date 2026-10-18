import { Check, Eye, Search, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Card, CardHeader, PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import type { Friendship, Profile } from '../data/types';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function Avatar({ name }: { name: string }) {
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">{initials(name)}</span>;
}

export function Friends({ onOpenDashboard }: { onOpenDashboard: () => void }) {
  const { backend, user, viewFriend } = useAuth();
  const { notify } = useUI();
  const [links, setLinks] = useState<Friendship[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => backend.listFriendships().then(setLinks).catch((e: Error) => setError(e.message)), [backend]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<void>, message: string) => {
    setError('');
    try {
      await fn();
      await refresh();
      notify(message);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (query.trim().length < 2) return setError('Type at least 2 characters of a user ID.');
    setBusy(true);
    try {
      setResults(await backend.searchProfiles(query));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const statusOf = (id: string) => links.find((l) => l.profile.id === id)?.status;
  const friends = links.filter((l) => l.status === 'friends');
  const incoming = links.filter((l) => l.status === 'incoming');
  const sent = links.filter((l) => l.status === 'requested');
  const open = (p: Profile) => {
    viewFriend(p);
    onOpenDashboard();
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Friends" subtitle={`Signed in as ${user?.profile.displayName}. Friends can view each other's dashboards but not change them.`} />
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}

      <Card>
        <CardHeader icon={Search} title="Find athletes" subtitle="Search by user ID" />
        <form onSubmit={search} className="flex gap-2 p-4 sm:p-5">
          <input className="input" placeholder="User ID" autoCapitalize="none" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search athletes" />
          <button type="submit" className="btn-primary shrink-0" disabled={busy}><Search size={15} /> Search</button>
        </form>
        {results && (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {results.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">No athletes found.</li>}
            {results.map((p) => {
              const st = statusOf(p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar name={p.displayName} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{p.displayName}</span>
                  {st === 'friends' ? (
                    <button className="btn-ghost text-xs" onClick={() => open(p)}><Eye size={14} /> View</button>
                  ) : st === 'requested' ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">Requested</span>
                  ) : st === 'incoming' ? (
                    <button className="btn-primary text-xs" onClick={() => run(() => backend.acceptFriend(p.id), `You and ${p.displayName} are now friends.`)}><Check size={14} /> Accept</button>
                  ) : (
                    <button className="btn-primary text-xs" onClick={() => run(() => backend.requestFriend(p.id), `Friend request sent to ${p.displayName}.`)}><UserPlus size={14} /> Add friend</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {incoming.length > 0 && (
        <Card>
          <CardHeader icon={UserPlus} title="Friend requests" subtitle="Accepting lets you see each other's dashboards" />
          <ul className="mt-3 divide-y divide-slate-100">
            {incoming.map(({ profile: p }) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar name={p.displayName} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{p.displayName}</span>
                <button className="btn-primary text-xs" onClick={() => run(() => backend.acceptFriend(p.id), `You and ${p.displayName} are now friends.`)}><Check size={14} /> Accept</button>
                <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Decline ${p.displayName}`} onClick={() => run(() => backend.removeFriend(p.id), 'Request declined.')}><X size={16} /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader icon={Users} title={`My friends (${friends.length})`} subtitle="Open a friend's dashboard to see their training — view only" />
        <ul className="mt-3 divide-y divide-slate-100">
          {friends.length === 0 && <li className="px-5 pb-5 text-sm text-slate-500">No friends yet — search above to add someone.</li>}
          {friends.map(({ profile: p }) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={p.displayName} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{p.displayName}</span>
              <button className="btn-primary text-xs" onClick={() => open(p)}><Eye size={14} /> View dashboard</button>
              <button
                className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Remove ${p.displayName}`}
                onClick={() => window.confirm(`Remove ${p.displayName} from your friends?`) && run(() => backend.removeFriend(p.id), `${p.displayName} removed.`)}
              >
                <UserMinus size={16} />
              </button>
            </li>
          ))}
        </ul>
        {sent.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Waiting for them to accept</p>
            <ul className="mt-2 space-y-2">
              {sent.map(({ profile: p }) => (
                <li key={p.id} className="flex items-center justify-between text-sm text-slate-700">
                  {p.displayName}
                  <button className="text-xs text-slate-500 hover:text-rose-600" onClick={() => run(() => backend.removeFriend(p.id), 'Request cancelled.')}>Cancel request</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
