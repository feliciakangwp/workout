import { BarChart3, Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { MIN_PASSWORD, usernameProblem } from '../lib/username';
import { Segmented } from './ui';
import { UsernameField, useUsernameCheck } from './UsernameField';

const DEMO_ACCOUNTS = ['Felicia', 'Fiona', 'Jordan'];

/** Sign in or sign up with a user ID and password. */
export function LoginScreen() {
  const { backend, signIn, signUp } = useAuth();
  const demo = backend.mode === 'demo';
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const check = useUsernameCheck(mode === 'signup' ? username : '');

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    if (mode === 'signin') {
      if (!username.trim() || !password) return setError('Enter your user ID and password.');
    } else {
      const problem = usernameProblem(username);
      if (problem) return setError(problem);
      if (check.status === 'taken') return setError(check.message);
      if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    }
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(username, password);
      else await signUp(username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const quick = async (name: string) => {
    setError('');
    setBusy(true);
    try {
      await signIn(name, '');
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
          <Segmented size="md" value={mode} onChange={(m) => { setMode(m); setError(''); }} options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Sign up' }]} />
          {mode === 'signup' ? (
            <UsernameField id="li-user" value={username} onChange={setUsername} check={check} />
          ) : (
            <div>
              <label className="label" htmlFor="li-user">User ID</label>
              <input id="li-user" className="input" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="li-pw">{mode === 'signup' ? 'Set a password' : 'Password'}</label>
            <div className="relative">
              <input id="li-pw" type={showPw ? 'text' : 'password'} className="input pr-10" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600" aria-label={showPw ? 'Hide password' : 'Show password'}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {mode === 'signup' && <p className="mt-1 text-xs text-slate-500">At least {MIN_PASSWORD} characters.</p>}
          </div>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{error}</p>}
          <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={busy || (mode === 'signup' && (check.status === 'taken' || check.status === 'checking'))}>
            {mode === 'signin' ? <><LogIn size={16} /> Sign in</> : <><UserPlus size={16} /> Create my profile</>}
          </button>
          {mode === 'signup' && <p className="text-center text-xs text-slate-500">Your user ID is your profile name. You can change it later by tapping your name.</p>}
        </form>

        {demo && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
            <p className="font-semibold">Demo mode</p>
            <p className="mt-0.5">Accounts are stored only in this browser. Connect Supabase so friends can sign up from their own phones.</p>
            <p className="mt-3 font-medium text-amber-900">Try a demo athlete (no password):</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((name) => (
                <button key={name} type="button" disabled={busy} onClick={() => quick(name)} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
