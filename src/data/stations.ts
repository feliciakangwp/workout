import type { StationId } from './types';

export interface StationInfo {
  id: StationId;
  order: number;
  name: string;
  /** Standard work for the station as recorded in this prototype. */
  spec: string;
  /** Example target time (seconds) used to score station performance. */
  targetSec: number;
  /** Optional secondary metric derived from the time. */
  derived?: { label: string; compute: (timeSec: number) => string };
}

const pacePer500 = (meters: number) => (t: number) => {
  const s = Math.round((t / meters) * 500);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /500m`;
};

export const STATIONS: StationInfo[] = [
  { id: 'skierg', order: 1, name: 'SkiErg', spec: '1000 m', targetSec: 270, derived: { label: 'Pace', compute: pacePer500(1000) } },
  { id: 'sledPush', order: 2, name: 'Sled Push', spec: '50 m · 102 kg', targetSec: 165 },
  { id: 'sledPull', order: 3, name: 'Sled Pull', spec: '50 m · 78 kg', targetSec: 240 },
  { id: 'burpeeBroadJump', order: 4, name: 'Burpee Broad Jump', spec: '80 m', targetSec: 270, derived: { label: 'Rate', compute: (t) => `${((80 / t) * 60).toFixed(1)} m/min` } },
  { id: 'rowing', order: 5, name: 'Rowing', spec: '1000 m', targetSec: 270, derived: { label: 'Pace', compute: pacePer500(1000) } },
  { id: 'farmersCarry', order: 6, name: "Farmer's Carry", spec: '200 m · 2×16 kg', targetSec: 110 },
  { id: 'sandbagLunges', order: 7, name: 'Sandbag Lunges', spec: '100 m · 10 kg', targetSec: 270 },
  { id: 'wallBalls', order: 8, name: 'Wall Balls', spec: '100 reps · 4 kg', targetSec: 300, derived: { label: 'Rate', compute: (t) => `${((100 / t) * 60).toFixed(1)} reps/min` } },
];

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s])) as Record<
  StationId,
  StationInfo
>;
