import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Profile } from '../data/types';
import { useAuth } from './AuthContext';

interface FriendRequestsValue {
  /** People who sent you a friend request you haven't answered. */
  incoming: Profile[];
  refresh: () => void;
}

const FriendRequestsContext = createContext<FriendRequestsValue>({ incoming: [], refresh: () => undefined });
const CHECK_EVERY_MS = 60 * 1000;

/** Keeps track of incoming friend requests: on sign-in, when the app comes back into view and every minute. */
export function FriendRequestsProvider({ children }: { children: ReactNode }) {
  const { backend, user } = useAuth();
  const [incoming, setIncoming] = useState<Profile[]>([]);
  const refresh = useCallback(() => {
    backend
      .listFriendships()
      .then((list) => setIncoming(list.filter((f) => f.status === 'incoming').map((f) => f.profile)))
      .catch(() => undefined);
  }, [backend]);
  useEffect(() => {
    if (!user) return setIncoming([]);
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(refresh, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [user, refresh]);
  const value = useMemo(() => ({ incoming, refresh }), [incoming, refresh]);
  return <FriendRequestsContext.Provider value={value}>{children}</FriendRequestsContext.Provider>;
}

export const useFriendRequests = () => useContext(FriendRequestsContext);
