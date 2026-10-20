import type { Goals, UserData } from '../data/types';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way merge of a keyed list: keeps what the other device added or changed,
 * plus this device's additions, changes and deletions since `base`.
 */
function mergeList<T>(base: T[] = [], local: T[] = [], server: T[] = [], key: (t: T) => string): T[] {
  const b = new Map(base.map((x) => [key(x), x]));
  const l = new Map(local.map((x) => [key(x), x]));
  const s = new Map(server.map((x) => [key(x), x]));
  const out: T[] = [];
  for (const [k, sv] of s) {
    const lv = l.get(k);
    if (b.has(k) && !lv) continue; // deleted here
    out.push(lv && !same(lv, b.get(k)) ? lv : sv); // changed here wins, else the saved version
  }
  for (const [k, lv] of l) if (!s.has(k) && !b.has(k)) out.push(lv); // added here
  return out;
}

/** Same as mergeList for records keyed by date / plan key. */
function mergeRecord<V>(base: Record<string, V> = {}, local: Record<string, V> = {}, server: Record<string, V> = {}): Record<string, V> {
  const keys = new Set([...Object.keys(server), ...Object.keys(local)]);
  const out: Record<string, V> = {};
  for (const k of keys) {
    const inB = k in base;
    const lv = local[k];
    const sv = server[k];
    if (k in local && (!inB || !same(lv, base[k]))) out[k] = lv; // added or changed here
    else if (k in server && !(inB && !(k in local))) out[k] = sv; // kept unless deleted here
  }
  return out;
}

/** Scalar fields: this device's change wins, otherwise the saved value. */
function mergeFields<T extends object>(base: T, local: T, server: T): T {
  const out = { ...server };
  for (const k of Object.keys(local) as (keyof T)[]) if (!same(local[k], base[k])) out[k] = local[k];
  return out;
}

/**
 * Combines this device's edits (`local`, made since `base` was loaded or saved)
 * with what another device saved meanwhile (`server`), so neither overwrites
 * the other: e.g. a race added on the phone survives a save from the laptop.
 */
export function mergeUserData(base: UserData, local: UserData, server: UserData): UserData {
  const { races: bR, ...bG } = base.goals;
  const { races: lR, ...lG } = local.goals;
  const { races: sR, ...sG } = server.goals;
  const goals: Goals = { ...mergeFields(bG, lG, sG), races: mergeList(bR, lR, sR, (r) => r.id) };
  return {
    ...mergeFields(base, local, server),
    goals,
    added: mergeList(base.added, local.added, server.added, (w) => w.id),
    drafts: mergeList(base.drafts, local.drafts, server.drafts, (d) => d.id),
    customExercises: mergeList(base.customExercises, local.customExercises, server.customExercises, (c) => c.name),
    weighIns: mergeList(base.weighIns, local.weighIns, server.weighIns, (w) => w.id),
    plan: mergeRecord(base.plan, local.plan, server.plan),
    planDetails: mergeRecord(base.planDetails, local.planDetails, server.planDetails),
  };
}
