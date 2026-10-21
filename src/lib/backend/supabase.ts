import { createClient } from '@supabase/supabase-js';
import type { BodySegment, Friendship, Profile, SegmentReading, SharedRace, UserData } from '../../data/types';
import type { ScanResult } from '../bodyScanOcr';
import type { AuthUser, Backend } from './types';
import { cleanUsername } from '../username';
import { mergePrivate, redact, splitPrivate, type PrivateData } from './privacy';

/** Domain of the hidden login addresses (no email is ever sent to them). */
const LOGIN_DOMAIN = 'users.hyrox-dashboard.app';

/**
 * Supabase backend: user ID + password sign-in, a public `profiles` table,
 * `friendships` (pending / accepted), one JSON document per athlete in
 * `user_data`, and `shared_races` for doubles / relay teammates. Row-level security in supabase/schema.sql makes data readable
 * only by its owner and accepted friends, and writable only by its owner.
 */
export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const db = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  const userId = async () => {
    const { data } = await db.auth.getUser();
    if (!data.user) throw new Error('Not signed in.');
    return data.user.id;
  };

  const profileOf = async (id: string, fallbackName = 'Athlete'): Promise<Profile> => {
    const { data } = await db.from('profiles').select('id, username').eq('id', id).maybeSingle();
    return { id, displayName: data?.username ?? fallbackName };
  };

  const authUser = async (id: string, name?: string): Promise<AuthUser> => ({ profile: await profileOf(id, name) });
  const notAvailable = (name: string) => new Error(`"${name}" is not available. Choose another user ID.`);

  return {
    mode: 'supabase',
    async currentUser() {
      const { data } = await db.auth.getSession();
      const u = data.session?.user;
      return u ? authUser(u.id, u.user_metadata?.username) : null;
    },
    async signIn(username, password) {
      // Accounts sign in with a hidden login address; look it up from the user ID.
      const { data: email, error: lookup } = await db.rpc('login_email', { p_username: cleanUsername(username) });
      if (lookup) throw new Error(lookup.message);
      if (!email) throw new Error('Wrong user ID or password.');
      const { data, error } = await db.auth.signInWithPassword({ email: email as string, password });
      if (error || !data.user) throw new Error(error?.message === 'Invalid login credentials' ? 'Wrong user ID or password.' : error?.message ?? 'Sign in failed.');
      return authUser(data.user.id);
    },
    async signUp(username, password) {
      const name = cleanUsername(username);
      if (!(await this.isUsernameAvailable(name))) throw notAvailable(name);
      // Supabase Auth needs an email, so each account gets a private, never-used login address.
      const { data, error } = await db.auth.signUp({ email: `${crypto.randomUUID()}@${LOGIN_DOMAIN}`, password, options: { data: { username: name } } });
      if (error) throw /database error/i.test(error.message) ? notAvailable(name) : new Error(error.message);
      if (!data.session || !data.user) throw new Error('Sign-up needs "Confirm email" turned off in Supabase (Authentication → Sign In / Providers → Email).');
      return authUser(data.user.id, name);
    },
    async signOut() {
      await db.auth.signOut();
    },
    async isUsernameAvailable(username) {
      const { data, error } = await db.rpc('username_available', { p_username: cleanUsername(username) });
      if (error) throw new Error(error.message);
      return data as boolean;
    },
    async changeUsername(username) {
      const me = await userId();
      const name = cleanUsername(username);
      const { error } = await db.from('profiles').update({ username: name }).eq('id', me);
      if (error) throw error.code === '23505' ? notAvailable(name) : new Error(error.message);
      // Shared races keep a copy of each member's name: update yours.
      const races = await this.listSharedRaces().catch(() => []);
      await Promise.all(
        races
          .filter((r) => r.members.some((m) => m.id === me && m.displayName !== name))
          .map((r) => this.saveSharedRace({ ...r, members: r.members.map((m) => (m.id === me ? { ...m, displayName: name } : m)) }).catch(() => undefined)),
      );
      return { id: me, displayName: name };
    },
    async searchProfiles(query) {
      const q = query.trim();
      if (!q) return [];
      const { data, error } = await db.rpc('search_profiles', { query: q });
      if (error) throw new Error(error.message);
      return (data as { id: string; username: string }[]).map((r) => ({ id: r.id, displayName: r.username }));
    },
    async listFriendships() {
      const me = await userId();
      const { data, error } = await db.from('friendships').select('requester, addressee, status');
      if (error) throw new Error(error.message);
      const rows = data as { requester: string; addressee: string; status: 'pending' | 'accepted' }[];
      const ids = rows.map((r) => (r.requester === me ? r.addressee : r.requester));
      const { data: profiles } = ids.length ? await db.from('profiles').select('id, username').in('id', ids) : { data: [] };
      const names = new Map((profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username]));
      return rows.map((r): Friendship => {
        const other = r.requester === me ? r.addressee : r.requester;
        return { profile: { id: other, displayName: names.get(other) ?? 'Athlete' }, status: r.status === 'accepted' ? 'friends' : r.requester === me ? 'requested' : 'incoming' };
      });
    },
    async requestFriend(profileId) {
      const me = await userId();
      const { data } = await db.from('friendships').select('requester').eq('requester', profileId).eq('addressee', me).maybeSingle();
      if (data) return this.acceptFriend(profileId);
      const { error } = await db.from('friendships').insert({ requester: me, addressee: profileId, status: 'pending' });
      if (error && error.code !== '23505') throw new Error(error.message); // 23505: request already sent
    },
    async acceptFriend(profileId) {
      const me = await userId();
      const { error } = await db.from('friendships').update({ status: 'accepted' }).eq('requester', profileId).eq('addressee', me);
      if (error) throw new Error(error.message);
    },
    async removeFriend(profileId) {
      const me = await userId();
      const { error } = await db
        .from('friendships')
        .delete()
        .or(`and(requester.eq.${me},addressee.eq.${profileId}),and(requester.eq.${profileId},addressee.eq.${me})`);
      if (error) throw new Error(error.message);
    },
    async loadUserData(id) {
      const { data, error } = await db.from('user_data').select('data').eq('user_id', id).maybeSingle();
      if (error) throw new Error(error.message);
      const shared = (data?.data as UserData | undefined) ?? null;
      if (!shared) return null;
      if (id !== (await userId())) return redact(shared);
      // Body weight and weigh-ins live in user_private, readable only by the athlete.
      const { data: priv, error: privError } = await db.from('user_private').select('data').eq('user_id', id).maybeSingle();
      if (privError) throw new Error(privError.message);
      return mergePrivate(shared, priv?.data as PrivateData | undefined);
    },
    async saveUserData(id, data) {
      const parts = splitPrivate(data);
      const now = new Date().toISOString();
      const [a, b] = await Promise.all([
        db.from('user_data').upsert({ user_id: id, data: parts.shared, updated_at: now }),
        db.from('user_private').upsert({ user_id: id, data: parts.private, updated_at: now }),
      ]);
      if (a.error || b.error) throw new Error((a.error ?? b.error)!.message);
    },
    async listSharedRaces() {
      const { data, error } = await db.from('shared_races').select('id, owner, data');
      if (error) throw new Error(error.message);
      return (data as { id: string; owner: string; data: Omit<SharedRace, 'id' | 'ownerId'> }[]).map((r) => ({ id: r.id, ownerId: r.owner, ...r.data }));
    },
    async saveSharedRace(race) {
      const { id, ownerId, ...data } = race;
      const row = { members: race.members.map((m) => m.id), data, updated_at: new Date().toISOString() };
      if (ownerId === (await userId())) {
        const { error } = await db.from('shared_races').upsert({ id, owner: ownerId, ...row });
        if (error) throw new Error(error.message);
        return;
      }
      // A tagged teammate edits the creator's race. An upsert would be checked as a new race owned by
      // someone else and refused, so update the existing row.
      const { data: updated, error } = await db.from('shared_races').update(row).eq('id', id).select('id');
      if (error) throw new Error(error.message);
      if (!updated?.length) throw new Error(`"${race.race.name}" was deleted by its creator, or you were untagged`);
    },
    async deleteSharedRace(id) {
      const { error } = await db.from('shared_races').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    async leaveSharedRace(id) {
      const { error } = await db.rpc('leave_shared_race', { race_id: id });
      if (error) throw new Error(error.message);
    },
    async readBodyScan(image, mediaType) {
      const { data, error } = await db.functions.invoke('read-body-scan', { body: { image, mediaType } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return fromAiReading(data);
    },
  };
}

type Nullable<T> = { [K in keyof T]: T[K] | null };
type AiReading = Nullable<Pick<ScanResult, 'weightKg' | 'skeletalMuscleKg' | 'bodyFatKg' | 'bodyFatPct'>> & {
  lean?: Partial<Record<BodySegment, Nullable<SegmentReading> | null>>;
  fat?: Partial<Record<BodySegment, Nullable<SegmentReading> | null>>;
};

/** The edge function's JSON (nulls for values not on the scan) as a ScanResult. */
function fromAiReading(r: AiReading): ScanResult {
  const v = (x: number | string | null | undefined) => (x === null ? undefined : x);
  const segs = (s: AiReading['lean']) =>
    Object.fromEntries(
      Object.entries(s ?? {}).map(([k, x]) => [k, { kg: v(x?.kg) as number | undefined, pct: v(x?.pct) as number | undefined, evaluation: v(x?.evaluation) as string | undefined }]),
    ) as ScanResult['lean'];
  const result: ScanResult = {
    weightKg: v(r.weightKg) as number | undefined,
    skeletalMuscleKg: v(r.skeletalMuscleKg) as number | undefined,
    bodyFatKg: v(r.bodyFatKg) as number | undefined,
    bodyFatPct: v(r.bodyFatPct) as number | undefined,
    lean: segs(r.lean),
    fat: segs(r.fat),
    found: 0,
  };
  result.found =
    [result.weightKg, result.skeletalMuscleKg, result.bodyFatKg, result.bodyFatPct].filter((x) => x !== undefined).length +
    [...Object.values(result.lean), ...Object.values(result.fat)].filter((x) => x?.kg !== undefined).length;
  return result;
}
