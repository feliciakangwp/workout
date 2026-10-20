import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Profile } from '../data/types';
import { getBackend, getDemoBackend, type AuthUser, type Backend } from '../lib/backend';

interface AuthContextValue {
  backend: Backend;
  /** null while signed out. */
  user: AuthUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  /** Changes your user ID. */
  changeUsername: (username: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Opens a demo athlete's dashboard without signing up. */
  enterDemo: (name: string) => Promise<void>;
  /** True while exploring the demo on an app that has real accounts (Supabase). */
  demoVisit: boolean;
  /** The athlete whose dashboard is shown: yourself, or a friend (read-only). */
  viewing: Profile | null;
  viewFriend: (p: Profile | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const real = useMemo(() => getBackend(), []);
  // The demo backend replaces the real one while someone is just looking around.
  const [backend, setBackend] = useState<Backend>(real);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [friend, setFriend] = useState<Profile | null>(null);

  useEffect(() => {
    real
      .currentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [real]);

  const enterDemo = useCallback(async (name: string) => {
    const demo = getDemoBackend();
    const u = await demo.signIn(name, '');
    setFriend(null);
    setBackend(demo);
    setUser(u);
    window.location.hash = '/overview';
  }, []);

  const signIn = useCallback(async (username: string, password: string) => setUser(await backend.signIn(username, password)), [backend]);
  const signUp = useCallback(async (username: string, password: string) => setUser(await backend.signUp(username, password)), [backend]);
  const changeUsername = useCallback(
    async (username: string) => {
      const profile = await backend.changeUsername(username);
      setUser((u) => (u ? { ...u, profile } : u));
    },
    [backend],
  );
  const signOut = useCallback(async () => {
    await backend.signOut();
    setFriend(null);
    setUser(null);
    setBackend(real);
    window.location.hash = '/overview';
  }, [backend, real]);

  const value = useMemo<AuthContextValue>(
    () => ({ backend, user, loading, signIn, signUp, changeUsername, signOut, enterDemo, demoVisit: backend !== real, viewing: friend ?? user?.profile ?? null, viewFriend: setFriend }),
    [backend, real, user, loading, signIn, signUp, changeUsername, signOut, enterDemo, friend],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
