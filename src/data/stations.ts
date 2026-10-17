import type { Division, SimType, StationId } from './types';

export interface StationInfo {
  id: StationId;
  order: number;
  name: string;
  /** Standard race work: metres, or reps for wall balls. */
  amount: number;
  unit: 'm' | 'reps';
  /** Exercise in the library used for muscle mapping. */
  exercise: string;
  /** Example target time (seconds) for the full standard, used to score performance. */
  targetSec: number;
  /** Optional secondary metric derived from a full-distance time. */
  derived?: { label: string; compute: (timeSec: number) => string };
}

const pacePer500 = (meters: number) => (t: number) => {
  const s = Math.round((t / meters) * 500);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /500m`;
};

export const STATIONS: StationInfo[] = [
  { id: 'skierg', order: 1, name: 'SkiErg', amount: 1000, unit: 'm', exercise: 'SkiErg Intervals', targetSec: 270, derived: { label: 'Pace', compute: pacePer500(1000) } },
  { id: 'sledPush', order: 2, name: 'Sled Push', amount: 50, unit: 'm', exercise: 'Sled Push', targetSec: 165 },
  { id: 'sledPull', order: 3, name: 'Sled Pull', amount: 50, unit: 'm', exercise: 'Sled Pull', targetSec: 240 },
  { id: 'burpeeBroadJump', order: 4, name: 'Burpee Broad Jump', amount: 80, unit: 'm', exercise: 'Burpee Broad Jump', targetSec: 270, derived: { label: 'Rate', compute: (t) => `${((80 / t) * 60).toFixed(1)} m/min` } },
  { id: 'rowing', order: 5, name: 'Rowing', amount: 1000, unit: 'm', exercise: 'Row Intervals', targetSec: 270, derived: { label: 'Pace', compute: pacePer500(1000) } },
  { id: 'farmersCarry', order: 6, name: "Farmer's Carry", amount: 200, unit: 'm', exercise: "Farmer's Carry (HYROX)", targetSec: 110 },
  { id: 'sandbagLunges', order: 7, name: 'Sandbag Lunges', amount: 100, unit: 'm', exercise: 'Sandbag Lunges', targetSec: 270 },
  { id: 'wallBalls', order: 8, name: 'Wall Balls', amount: 100, unit: 'reps', exercise: 'Wall Balls', targetSec: 300, derived: { label: 'Rate', compute: (t) => `${((100 / t) * 60).toFixed(1)} reps/min` } },
];

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s])) as Record<StationId, StationInfo>;

/** Official station loads (kg) by division. Farmer's carry is per hand. */
const WEIGHTS: Record<string, Partial<Record<StationId, number>>> = {
  'female-open': { sledPush: 102, sledPull: 78, farmersCarry: 16, sandbagLunges: 10, wallBalls: 4 },
  'female-pro': { sledPush: 152, sledPull: 103, farmersCarry: 24, sandbagLunges: 20, wallBalls: 6 },
  'male-open': { sledPush: 152, sledPull: 103, farmersCarry: 24, sandbagLunges: 20, wallBalls: 6 },
  'male-pro': { sledPush: 202, sledPull: 153, farmersCarry: 32, sandbagLunges: 30, wallBalls: 9 },
};

export const stationWeight = (id: StationId, d: Division) => WEIGHTS[`${d.sex}-${d.category}`][id];

export const SIM_TYPES: { id: SimType; label: string; fraction: number }[] = [
  { id: 'half', label: 'Half Sim', fraction: 0.5 },
  { id: 'threeQuarter', label: '¾ Sim', fraction: 0.75 },
  { id: 'full', label: 'Full Sim', fraction: 1 },
];
export const simFraction = (sim: SimType) => SIM_TYPES.find((s) => s.id === sim)!.fraction;
export const simLabel = (sim: SimType) => SIM_TYPES.find((s) => s.id === sim)!.label;

const fmtAmount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** e.g. "1000 m", "25 m · 102 kg", "100 m · 2×16 kg", "50 reps · 4 kg" */
export function stationSpec(id: StationId, d: Division, fraction = 1) {
  const s = STATION_BY_ID[id];
  const w = stationWeight(id, d);
  const amount = `${fmtAmount(s.amount * fraction)} ${s.unit}`;
  if (!w) return amount;
  return `${amount} · ${id === 'farmersCarry' ? `2×${w}` : w} kg`;
}

export const divisionLabel = (d: Division) => `${d.sex === 'female' ? 'Women' : 'Men'} · ${d.category === 'pro' ? 'Pro' : 'Open'}`;
