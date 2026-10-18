import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Profile } from '../data/types';
import { getBackend, type AuthUser, type Backend } from '../lib/backend';

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
  /** The athlete whose dashboard is shown: yourself, or a friend (read-only). */
  viewing: Profile | null;
  viewFriend: (p: Profile | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [friend, setFriend] = useState<Profile | null>(null);

  useEffect(() => {
    backend
      .currentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [backend]);

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
    window.location.hash = '/overview';
  }, [backend]);

  const value = useMemo<AuthContextValue>(
    () => ({ backend, user, loading, signIn, signUp, changeUsername, signOut, viewing: friend ?? user?.profile ?? null, viewFriend: setFriend }),
    [backend, user, loading, signIn, signUp, changeUsername, signOut, friend],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
