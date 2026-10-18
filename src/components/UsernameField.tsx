import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { USERNAME_RULE, cleanUsername, usernameProblem } from '../lib/username';

export type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

/** Checks, shortly after typing stops, whether a user ID is valid and free. `current` (your own ID) counts as free. */
export function useUsernameCheck(name: string, current?: string): { status: UsernameStatus; message: string } {
  const { backend } = useAuth();
  const [state, setState] = useState<{ status: UsernameStatus; message: string }>({ status: 'idle', message: '' });
  useEffect(() => {
    const n = cleanUsername(name);
    if (!n) return setState({ status: 'idle', message: '' });
    const problem = usernameProblem(n);
    if (problem) return setState({ status: 'invalid', message: problem });
    if (current && n === current) return setState({ status: 'idle', message: '' });
    setState({ status: 'checking', message: 'Checking…' });
    let live = true;
    const t = setTimeout(() => {
      backend
        .isUsernameAvailable(n)
        .then((ok) => live && setState(ok ? { status: 'available', message: `"${n}" is available.` } : { status: 'taken', message: `"${n}" is not available. Choose another user ID.` }))
        .catch(() => live && setState({ status: 'error', message: "Couldn't check this user ID. Try again." }));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name, current, backend]);
  return state;
}

export function UsernameField({ id, value, onChange, check, autoFocus }: { id: string; value: string; onChange: (v: string) => void; check?: { status: UsernameStatus; message: string }; autoFocus?: boolean }) {
  const s = check?.status ?? 'idle';
  const tone = s === 'available' ? 'text-emerald-700' : s === 'taken' || s === 'invalid' || s === 'error' ? 'text-rose-700' : 'text-slate-500';
  const Icon = s === 'available' ? CheckCircle2 : s === 'checking' ? Loader2 : s === 'taken' || s === 'invalid' || s === 'error' ? XCircle : null;
  return (
    <div>
      <label className="label" htmlFor={id}>User ID</label>
      <input id={id} className="input" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus={autoFocus} placeholder="e.g. felicia_k" value={value} onChange={(e) => onChange(e.target.value)} />
      <p className={`mt-1 flex items-center gap-1 text-xs ${tone}`} role={check ? 'status' : undefined}>
        {Icon && <Icon size={13} className={s === 'checking' ? 'animate-spin' : ''} />}
        {check?.message || USERNAME_RULE}
      </p>
    </div>
  );
}
