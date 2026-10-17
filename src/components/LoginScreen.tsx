import { BarChart3, LogIn, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { Segmented } from './ui';

const DEMO_ACCOUNTS = [
  { name: 'Felicia', email: 'felicia@demo.app' },
  { name: 'Fiona', email: 'fiona@demo.app' },
  { name: 'Jordan', email: 'jordan@demo.app' },
];

export function LoginScreen() {
  const { backend, signIn, signUp } = useAuth();
  const demo = backend.mode === 'demo';
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    setNotice('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (!demo && password.length < 8) return setError('Password must be at least 8 characters.');
    if (mode === 'signup' && !name.trim()) return setError('Enter your name.');
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email, password);
      else if (!(await signUp(email, password, name))) {
        setNotice('Check your email to confirm your account, then sign in.');
        setMode('signin');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const quick = async (addr: string) => {
    setError('');
    setBusy(true);
    try {
      await signIn(addr, '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <BarChart3 size={22} />
          </span>
          <div>
            <p className="text-lg font-semibold text-slate-900">HYROX Performance</p>
            <p className="text-xs text-slate-500">Training & race dashboard</p>
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5">
          <Segmented size="md" value={mode} onChange={(m) => { setMode(m); setError(''); }} options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} />
          {mode === 'signup' && (
            <div>
              <label className="label" htmlFor="li-name">Your name</label>
              <input id="li-name" className="input" autoComplete="name" placeholder="e.g. Felicia" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="li-email">Email</label>
            <input id="li-email" type="email" className="input" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {!demo && (
            <div>
              <label className="label" htmlFor="li-pw">Password</label>
              <input id="li-pw" type="password" className="input" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{error}</p>}
          {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700" role="status">{notice}</p>}
          <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={busy}>
            {mode === 'signin' ? <><LogIn size={16} /> Sign in</> : <><UserPlus size={16} /> Create account</>}
          </button>
        </form>

        {demo && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
            <p className="font-semibold">Demo mode</p>
            <p className="mt-0.5">Accounts are stored only in this browser and need no password. Connect Supabase to use real email sign-in.</p>
            <p className="mt-3 font-medium text-amber-900">Try a demo athlete:</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.email} type="button" disabled={busy} onClick={() => quick(a.email)} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
