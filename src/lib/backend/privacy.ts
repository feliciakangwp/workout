import type { Goals, UserData, WeighIn } from '../../data/types';

/** Body data only the athlete sees: never shown to, or sent to, friends. */
export interface PrivateData {
  bodyWeight?: Goals['bodyWeight'];
  weighIns: WeighIn[];
  /** @deprecated Old example values, ignored when read. */
  currentWeightKg?: number;
  targetWeightKg?: number;
}

/** Splits an athlete's data into the part friends may read and the private body data. */
export function splitPrivate(data: UserData): { shared: UserData; private: PrivateData } {
  return {
    shared: redact(data),
    private: { bodyWeight: data.goals.bodyWeight, weighIns: data.weighIns ?? [] },
  };
}

/** Restores the private body data into the athlete's own data. */
export function mergePrivate(data: UserData, p: PrivateData | null | undefined): UserData {
  if (!p) return data;
  return { ...data, goals: { ...data.goals, bodyWeight: p.bodyWeight, currentWeightKg: undefined, targetWeightKg: undefined }, weighIns: p.weighIns };
}

/** An athlete's data without body weight or weigh-ins, as friends see it. */
export function redact(data: UserData): UserData {
  return { ...data, goals: { ...data.goals, bodyWeight: undefined, currentWeightKg: undefined, targetWeightKg: undefined }, weighIns: [] };
}
