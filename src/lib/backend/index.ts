import { createDemoBackend } from './demo';
import { createSupabaseBackend } from './supabase';
import type { Backend } from './types';

export type { AuthUser, Backend } from './types';
export { newUserData } from './defaults';

let instance: Backend | null = null;

/** Supabase when its URL and anon key are configured at build time; otherwise browser-only demo accounts. */
export function getBackend(): Backend {
  if (instance) return instance;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  instance = url && key ? createSupabaseBackend(url, key) : createDemoBackend();
  return instance;
}
