import { DEFAULT_GOALS } from '../../data/mockData';
import type { Friendship, Profile, SharedRace, UserData } from '../../data/types';
import { FELICIA_DATA, hashString, newUserData } from './defaults';
import type { AuthUser, Backend } from './types';
import { cleanUsername } from '../username';

interface DemoUser extends Profile {
  /** Hash of the password; demonstration athletes have none and sign in without one. */
  passwordHash?: string;
}
interface DemoLink {
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
}
interface DemoStore {
  users: DemoUser[];
  links: DemoLink[];
  data: Record<string, UserData>;
  sharedRaces: SharedRace[];
  session: string | null;
}

const KEY = 'hyrox-dashboard.demo.v1';

function seedStore(): DemoStore {
  const fiona: UserData = {
    ...newUserData('demo-fiona', true),
    sample: { seed: 7331, liftScale: 1.12, paceShiftSec: -12 },
    goals: {
      ...DEFAULT_GOALS,
      currentWeightKg: 61,
      targetWeightKg: 59,
      races: [
        { id: 'f-1', name: 'HYROX Kuala Lumpur Relay', date: '2026-11-21', format: 'relay', category: 'open', relayStations: ['sledPush', 'sandbagLunges'] },
        { id: 'f-2', name: 'HYROX Bangkok', date: '2026-07-11', format: 'solo', category: 'open', relayStations: [], result: { totalSec: 5380, splits: [] } },
      ],
    },
  };
  const jordan: UserData = {
    ...newUserData('demo-jordan', true),
    sample: { seed: 4242, liftScale: 1.35, paceShiftSec: -25 },
    goals: {
      ...DEFAULT_GOALS,
      athleteSex: 'male',
      currentWeightKg: 78,
      targetWeightKg: 76,
      races: [{ id: 'j-1', name: 'HYROX Singapore', date: '2026-11-28', format: 'doubles', category: 'pro', relayStations: [] }],
    },
  };
  return {
    users: [
      { id: 'demo-felicia', displayName: 'Felicia' },
      { id: 'demo-fiona', displayName: 'Fiona' },
      { id: 'demo-jordan', displayName: 'Jordan' },
    ],
    // Jordan has already sent Felicia a friend request.
    links: [{ requester: 'demo-jordan', addressee: 'demo-felicia', status: 'pending' }],
    data: { 'demo-felicia': FELICIA_DATA, 'demo-fiona': fiona, 'demo-jordan': jordan },
    sharedRaces: [],
    session: null,
  };
}

/** Demo accounts kept in this browser's storage (falls back to memory if storage is unavailable). */
export function createDemoBackend(): Backend {
  let memory: DemoStore | null = null;
  const load = (): DemoStore => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const stored = JSON.parse(raw) as DemoStore;
        return { ...stored, sharedRaces: stored.sharedRaces ?? [] };
      }
    } catch {
      /* storage unavailable */
    }
    return memory ?? (memory = seedStore());
  };
  const save = (s: DemoStore) => {
    memory = s;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable: keep in memory */
    }
  };
  const toAuth = (u: DemoUser): AuthUser => ({ profile: { id: u.id, displayName: u.displayName } });
  const pwHash = (id: string, password: string) => String(hashString(`${id}:${password}`));
  const byName = (s: DemoStore, name: string) => s.users.find((x) => x.displayName.toLowerCase() === cleanUsername(name).toLowerCase());
  const me = (s: DemoStore) => {
    if (!s.session) throw new Error('Not signed in.');
    return s.session;
  };
  const between = (l: DemoLink, a: string, b: string) => (l.requester === a && l.addressee === b) || (l.requester === b && l.addressee === a);

  return {
    mode: 'demo',
    async currentUser() {
      const s = load();
      const u = s.users.find((x) => x.id === s.session);
      return u ? toAuth(u) : null;
    },
    async signIn(username, password) {
      const s = load();
      const u = byName(s, username);
      if (!u || (u.passwordHash && u.passwordHash !== pwHash(u.id, password))) throw new Error('Wrong user ID or password.');
      save({ ...s, session: u.id });
      return toAuth(u);
    },
    async signUp(username, password) {
      const s = load();
      const name = cleanUsername(username);
      if (byName(s, name)) throw new Error(`"${name}" is not available. Choose another user ID.`);
      const id = `user-${hashString(name.toLowerCase() + Date.now())}`;
      const u: DemoUser = { id, displayName: name, passwordHash: pwHash(id, password) };
      save({ ...s, users: [...s.users, u], data: { ...s.data, [u.id]: newUserData(u.id) }, session: u.id });
      return toAuth(u);
    },
    async isUsernameAvailable(username) {
      const s = load();
      const u = byName(s, username);
      return !u || u.id === s.session;
    },
    async changeUsername(username) {
      const s = load();
      const id = me(s);
      const name = cleanUsername(username);
      const taken = byName(s, name);
      if (taken && taken.id !== id) throw new Error(`"${name}" is not available. Choose another user ID.`);
      // Keep teammates' copies of shared races showing the new name.
      const rename = (p: Profile) => (p.id === id ? { ...p, displayName: name } : p);
      save({
        ...s,
        users: s.users.map((u) => (u.id === id ? { ...u, displayName: name } : u)),
        sharedRaces: s.sharedRaces.map((r) => ({ ...r, members: r.members.map(rename) })),
      });
      return { id, displayName: name };
    },
    async signOut() {
      save({ ...load(), session: null });
    },
    async searchProfiles(query) {
      const s = load();
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return s.users
        .filter((u) => u.id !== s.session && u.displayName.toLowerCase().includes(q))
        .map(({ id, displayName }) => ({ id, displayName }));
    },
    async listFriendships() {
      const s = load();
      const id = me(s);
      return s.links
        .filter((l) => l.requester === id || l.addressee === id)
        .map((l): Friendship => {
          const otherId = l.requester === id ? l.addressee : l.requester;
          const other = s.users.find((u) => u.id === otherId)!;
          return { profile: { id: other.id, displayName: other.displayName }, status: l.status === 'accepted' ? 'friends' : l.requester === id ? 'requested' : 'incoming' };
        });
    },
    async requestFriend(profileId) {
      const s = load();
      const id = me(s);
      const existing = s.links.find((l) => between(l, id, profileId));
      if (existing?.requester === profileId) return this.acceptFriend(profileId);
      if (existing) return;
      save({ ...s, links: [...s.links, { requester: id, addressee: profileId, status: 'pending' }] });
    },
    async acceptFriend(profileId) {
      const s = load();
      const id = me(s);
      save({ ...s, links: s.links.map((l) => (l.requester === profileId && l.addressee === id ? { ...l, status: 'accepted' } : l)) });
    },
    async removeFriend(profileId) {
      const s = load();
      const id = me(s);
      save({ ...s, links: s.links.filter((l) => !between(l, id, profileId)) });
    },
    async loadUserData(userId) {
      const s = load();
      const id = me(s);
      const allowed = userId === id || s.links.some((l) => l.status === 'accepted' && between(l, id, userId));
      if (!allowed) throw new Error('You can only view friends who have accepted your request.');
      return s.data[userId] ?? null;
    },
    async saveUserData(userId, data) {
      const s = load();
      if (userId !== me(s)) throw new Error('You can only change your own data.');
      save({ ...s, data: { ...s.data, [userId]: data } });
    },
    async listSharedRaces() {
      const s = load();
      const id = me(s);
      return s.sharedRaces.filter((r) => r.members.some((m) => m.id === id));
    },
    async saveSharedRace(race) {
      const s = load();
      const id = me(s);
      const prev = s.sharedRaces.find((r) => r.id === race.id);
      if (prev && !prev.members.some((m) => m.id === id)) throw new Error('You are not in this race.');
      const owner = prev?.ownerId ?? id;
      if (race.ownerId !== owner) throw new Error('The race owner cannot be changed.');
      const ids = (rs: SharedRace) => rs.members.map((m) => m.id).sort().join();
      if (prev && ids(prev) !== ids(race) && id !== owner) throw new Error(`Only the person who created the race can change teammates.`);
      const notFriend = race.members.find((m) => m.id !== owner && !s.links.some((l) => l.status === 'accepted' && between(l, owner, m.id)));
      if (notFriend) throw new Error(`${notFriend.displayName} must be a friend to be tagged.`);
      save({ ...s, sharedRaces: prev ? s.sharedRaces.map((r) => (r.id === race.id ? race : r)) : [...s.sharedRaces, race] });
    },
    async deleteSharedRace(raceId) {
      const s = load();
      const id = me(s);
      const prev = s.sharedRaces.find((r) => r.id === raceId);
      if (prev && prev.ownerId !== id) throw new Error('Only the person who created the race can delete it.');
      save({ ...s, sharedRaces: s.sharedRaces.filter((r) => r.id !== raceId) });
    },
    async leaveSharedRace(raceId) {
      const s = load();
      const id = me(s);
      save({
        ...s,
        sharedRaces: s.sharedRaces.map((r) => {
          if (r.id !== raceId) return r;
          const { [id]: _, ...memberStations } = r.memberStations;
          return { ...r, members: r.members.filter((m) => m.id !== id), memberStations };
        }),
      });
    },
  };
}
