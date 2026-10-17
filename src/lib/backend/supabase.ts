import { createClient } from '@supabase/supabase-js';
import type { Friendship, Profile, UserData } from '../../data/types';
import type { AuthUser, Backend } from './types';

/**
 * Supabase backend: email + password auth, a public `profiles` table,
 * `friendships` (pending / accepted) and one JSON document per athlete in
 * `user_data`. Row-level security in supabase/schema.sql makes data readable
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
    const { data } = await db.from('profiles').select('id, display_name').eq('id', id).maybeSingle();
    return { id, displayName: data?.display_name ?? fallbackName };
  };

  const authUser = async (id: string, email: string, name?: string): Promise<AuthUser> => ({ profile: await profileOf(id, name), email });

  return {
    mode: 'supabase',
    async currentUser() {
      const { data } = await db.auth.getSession();
      const u = data.session?.user;
      return u ? authUser(u.id, u.email ?? '', u.user_metadata?.display_name) : null;
    },
    async signIn(email, password) {
      const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user) throw new Error(error?.message ?? 'Sign in failed.');
      return authUser(data.user.id, data.user.email ?? email, data.user.user_metadata?.display_name);
    },
    async signUp(email, password, displayName) {
      const { data, error } = await db.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() }, emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
      });
      if (error) throw new Error(error.message);
      // Without a session the project requires email confirmation first.
      if (!data.session || !data.user) return { user: null };
      return { user: await authUser(data.user.id, data.user.email ?? email, displayName) };
    },
    async signOut() {
      await db.auth.signOut();
    },
    async searchProfiles(query) {
      const q = query.trim();
      if (!q) return [];
      const { data, error } = await db.rpc('search_profiles', { query: q });
      if (error) throw new Error(error.message);
      return (data as { id: string; display_name: string }[]).map((r) => ({ id: r.id, displayName: r.display_name }));
    },
    async listFriendships() {
      const me = await userId();
      const { data, error } = await db.from('friendships').select('requester, addressee, status');
      if (error) throw new Error(error.message);
      const rows = data as { requester: string; addressee: string; status: 'pending' | 'accepted' }[];
      const ids = rows.map((r) => (r.requester === me ? r.addressee : r.requester));
      const { data: profiles } = ids.length ? await db.from('profiles').select('id, display_name').in('id', ids) : { data: [] };
      const names = new Map((profiles ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name]));
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
      return (data?.data as UserData | undefined) ?? null;
    },
    async saveUserData(id, data) {
      const { error } = await db.from('user_data').upsert({ user_id: id, data, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
  };
}
