import type { Friendship, Profile, SharedRace, UserData } from '../../data/types';
import type { ScanResult } from '../bodyScanOcr';

export interface AuthUser {
  profile: Profile;
  email: string;
}

/**
 * Storage and authentication used by the app. The demo backend keeps
 * accounts in this browser; the Supabase backend is used when
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set at build time.
 */
export interface Backend {
  mode: 'demo' | 'supabase';
  /** Restores the signed-in session, if any. */
  currentUser(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  /** `user` is null when the account must confirm its email first. */
  signUp(email: string, password: string, displayName: string): Promise<{ user: AuthUser | null }>;
  signOut(): Promise<void>;
  /** Other athletes matching a name, or an exact email address. */
  searchProfiles(query: string): Promise<Profile[]>;
  listFriendships(): Promise<Friendship[]>;
  /** Sends a friend request (or accepts one already received from this athlete). */
  requestFriend(profileId: string): Promise<void>;
  acceptFriend(profileId: string): Promise<void>;
  /** Removes a friend, cancels a sent request or declines a received one. */
  removeFriend(profileId: string): Promise<void>;
  /** Own data, or an accepted friend's data (read-only). */
  loadUserData(userId: string): Promise<UserData | null>;
  saveUserData(userId: string, data: UserData): Promise<void>;
  /** Shared races the signed-in athlete is a member of. */
  listSharedRaces(): Promise<SharedRace[]>;
  /**
   * Creates or updates a shared race. Members must be the owner's friends;
   * only the owner can change who is in it.
   */
  saveSharedRace(race: SharedRace): Promise<void>;
  /** Owner only. */
  deleteSharedRace(id: string): Promise<void>;
  /** A tagged teammate removes themselves from the race. */
  leaveSharedRace(id: string): Promise<void>;
  /**
   * Reads a body composition scan with Claude (Supabase Edge Function
   * `read-body-scan`). Absent in demo mode, where scans are read on-device.
   */
  readBodyScan?(imageBase64: string, mediaType: string): Promise<ScanResult>;
}
