import type { UserData, WeighIn } from '../../data/types';

/** Body data only the athlete sees: never shown to, or sent to, friends. */
export interface PrivateData {
  currentWeightKg: number;
  targetWeightKg: number;
  weighIns: WeighIn[];
}

/** Splits an athlete's data into the part friends may read and the private body data. */
export function splitPrivate(data: UserData): { shared: UserData; private: PrivateData } {
  return {
    shared: redact(data),
    private: { currentWeightKg: data.goals.currentWeightKg, targetWeightKg: data.goals.targetWeightKg, weighIns: data.weighIns ?? [] },
  };
}

/** Restores the private body data into the athlete's own data. */
export function mergePrivate(data: UserData, p: PrivateData | null | undefined): UserData {
  if (!p) return data;
  return { ...data, goals: { ...data.goals, currentWeightKg: p.currentWeightKg, targetWeightKg: p.targetWeightKg }, weighIns: p.weighIns };
}

/** An athlete's data without body weight or weigh-ins, as friends see it. */
export function redact(data: UserData): UserData {
  return { ...data, goals: { ...data.goals, currentWeightKg: 0, targetWeightKg: 0 }, weighIns: [] };
}
