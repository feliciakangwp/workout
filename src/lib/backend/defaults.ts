import { DEFAULT_GOALS, DEFAULT_SAMPLE } from '../../data/mockData';
import type { UserData } from '../../data/types';

/** Small stable hash so each new athlete gets distinct demonstration data. */
export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Starting data for a new account: its own demonstration workouts and no races yet. */
export function newUserData(userId: string): UserData {
  const h = hashString(userId);
  return {
    version: 1,
    sample: { seed: h, liftScale: 0.9 + (h % 25) / 100, paceShiftSec: (h % 31) - 15 },
    added: [],
    goals: { ...DEFAULT_GOALS, races: [] },
    plan: {},
    drafts: [],
    customExercises: [],
  };
}

/** Felicia's data: the original demonstration block and races. */
export const FELICIA_DATA: UserData = {
  version: 1,
  sample: DEFAULT_SAMPLE,
  added: [],
  goals: DEFAULT_GOALS,
  plan: {},
  drafts: [],
  customExercises: [],
};
