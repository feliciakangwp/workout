import type { RaceFormat, RedlineDivision } from './types';

/** Redline's 12 stations, in race order. */
export const REDLINE_STATIONS = [
  'Run',
  'SkiErg',
  'Deadball Over Shoulder',
  'BikeErg',
  "Farmer's Carry",
  'Shuttle Run',
  'Plank Pull',
  'Sandbag Gauntlet',
  'RowErg',
  'Burpee Thruster',
  'The Mule',
  'Sled Push & Pull',
] as const;

export const REDLINE_LEVELS: { level: 1 | 2 | 3; label: string }[] = [
  { level: 1, label: 'Level 1 · Beginner' },
  { level: 2, label: 'Level 2 · Intermediate' },
  { level: 3, label: 'Level 3 · Advanced' },
];

/** The work for each station, in the order of REDLINE_STATIONS. */
type Spec = readonly string[];

const WOMEN_L1: Spec = ['500m', '15 calories', '20 reps × 12kg', '15 calories', '1 lap × 16kg', '10 × 20m (200m total)', '4 × 12m, 10kg', '1 round, unweighted', '15 calories', '10 reps × 4kg', '60m unweighted + 120m × 15kg', '60m × 20kg'];
const WOMEN_L2: Spec = ['500m', '25 calories', '40 reps × 12kg', '25 calories', '2 laps × 16kg', '20 × 20m (400m total)', '4 × 12m, 15kg', '1 round × 15kg', '25 calories', '20 reps × 4kg', '60m × 15kg + 120m × 15kg', '60m × 35kg'];
const WOMEN_L3: Spec = ['500m', '35 calories', '60 reps × 12kg', '35 calories', '3 laps × 16kg', '30 × 20m (600m total)', '4 × 12m, 20kg', '2 rounds × 15kg', '35 calories', '30 reps × 4kg', '60m × 15kg + 120m × 20kg', '60m × 65kg'];

/*
 * Men's and mixed standards weren't in the race guide provided, so these are
 * ESTIMATES: the women's work with heavier loads (deadball 20kg, carries 24kg,
 * sandbag 20kg, burpee thruster 6kg, plank pull +5kg, sleds heavier). Mixed
 * teams use the women's team loads. Replace with the official numbers.
 */
const MEN_L1: Spec = ['500m', '15 calories', '20 reps × 20kg', '15 calories', '1 lap × 24kg', '10 × 20m (200m total)', '4 × 12m, 15kg', '1 round, unweighted', '15 calories', '10 reps × 6kg', '60m unweighted + 120m × 20kg', '60m × 35kg'];
const MEN_L2: Spec = ['500m', '25 calories', '40 reps × 20kg', '25 calories', '2 laps × 24kg', '20 × 20m (400m total)', '4 × 12m, 20kg', '1 round × 20kg', '25 calories', '20 reps × 6kg', '60m × 20kg + 120m × 20kg', '60m × 50kg'];
const MEN_L3: Spec = ['500m', '35 calories', '60 reps × 20kg', '35 calories', '3 laps × 24kg', '30 × 20m (600m total)', '4 × 12m, 25kg', '2 rounds × 20kg', '35 calories', '30 reps × 6kg', '60m × 20kg + 120m × 25kg', '60m × 90kg'];

interface RedlineConfig {
  label: string;
  spec: Spec;
  /** Not from the official guide yet. */
  estimated?: boolean;
  note?: string;
}

const CONFIGS: Record<string, RedlineConfig> = {
  'women-solo-1': { label: "Women's Singles · Level 1 (Beginner)", spec: WOMEN_L1 },
  'women-solo-2': { label: "Women's Singles · Level 2 (Intermediate)", spec: WOMEN_L2 },
  'women-solo-3': { label: "Women's Singles · Level 3 (Advanced)", spec: WOMEN_L3 },
  'women-doubles': { label: "Women's Doubles", spec: WOMEN_L3, note: 'Combined team requirements.' },
  'women-relay': { label: "Women's Team Relay", spec: WOMEN_L2, note: 'Published station requirements, not necessarily each member’s workload.' },
  'men-solo-1': { label: "Men's Singles · Level 1 (Beginner)", spec: MEN_L1, estimated: true },
  'men-solo-2': { label: "Men's Singles · Level 2 (Intermediate)", spec: MEN_L2, estimated: true },
  'men-solo-3': { label: "Men's Singles · Level 3 (Advanced)", spec: MEN_L3, estimated: true },
  'men-doubles': { label: "Men's Doubles", spec: MEN_L3, estimated: true, note: 'Combined team requirements.' },
  'men-relay': { label: "Men's Team Relay", spec: MEN_L2, estimated: true, note: 'Published station requirements, not necessarily each member’s workload.' },
  'mixed-doubles': { label: 'Mixed Doubles', spec: WOMEN_L3, estimated: true, note: 'Combined team requirements.' },
  'mixed-relay': { label: 'Mixed Team Relay', spec: WOMEN_L2, estimated: true, note: 'Published station requirements, not necessarily each member’s workload.' },
};

/** The Redline category for a race: singles by level, or doubles / relay by division. */
export function redlineConfig(format: RaceFormat, division: RedlineDivision, level: 1 | 2 | 3): RedlineConfig {
  const div = format === 'solo' && division === 'mixed' ? 'women' : division; // singles has no mixed category
  return CONFIGS[format === 'solo' ? `${div}-solo-${level}` : `${div}-${format}`];
}
