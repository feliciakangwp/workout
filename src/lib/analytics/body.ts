import type { BodySegment, Sex, WeighIn } from '../../data/types';
import { diffDays } from '../dates';

export const SEGMENTS: { id: BodySegment; label: string }[] = [
  { id: 'leftArm', label: 'Left arm' },
  { id: 'rightArm', label: 'Right arm' },
  { id: 'trunk', label: 'Trunk' },
  { id: 'leftLeg', label: 'Left leg' },
  { id: 'rightLeg', label: 'Right leg' },
];
export const segmentLabel = (s: BodySegment) => SEGMENTS.find((x) => x.id === s)!.label;
export const EVALUATION_OPTIONS = ['Under', 'Normal', 'Over'];

/** Total lean / fat mass from the five segments, when all are present. */
export const segmentTotal = (s: WeighIn['lean']) => {
  const parts = SEGMENTS.map(({ id }) => s[id]?.kg);
  return parts.every((v) => v !== undefined) ? Math.round(parts.reduce((a, v) => a + v!, 0) * 100) / 100 : undefined;
};

export const sortWeighIns = (list: WeighIn[]) => [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Two invented demonstration weigh-ins (shown until the athlete uploads their own):
 * about 9 weeks of training with a little fat lost and muscle gained.
 */
export function sampleWeighIns(seed: number, currentWeightKg: number, sex: Sex): WeighIn[] {
  const m = sex === 'male' ? 1.38 : 1;
  const j = (k: number) => ((Math.imul(seed ^ (k * 2654435761), 1597334677) >>> 0) % 1000) / 1000 - 0.5; // −0.5…0.5, stable per seed
  const leanIdeal: Record<BodySegment, number> = { leftArm: 2.1 * m, rightArm: 2.1 * m, trunk: 19 * m, leftLeg: 6.6 * m, rightLeg: 6.6 * m };
  const fatIdeal: Record<BodySegment, number> = { leftArm: 0.9 / m, rightArm: 0.9 / m, trunk: 5 / m, leftLeg: 2.3 / m, rightLeg: 2.3 / m };
  const leanShare: Record<BodySegment, number> = { leftArm: 0.06, rightArm: 0.062, trunk: 0.53, leftLeg: 0.175, rightLeg: 0.173 };
  const fatShare: Record<BodySegment, number> = { leftArm: 0.07, rightArm: 0.07, trunk: 0.5, leftLeg: 0.18, rightLeg: 0.18 };
  const make = (id: string, date: string, weight: number, pbf: number, leanBoost: number): WeighIn => {
    const fatKg = round((weight * pbf) / 100);
    const leanTotal = (weight - fatKg) * 0.83 * (1 + leanBoost);
    const seg = <T,>(fn: (s: BodySegment) => T) => Object.fromEntries(SEGMENTS.map(({ id: s }) => [s, fn(s)])) as Record<BodySegment, T>;
    const lean = seg((s) => {
      const kg = round(leanTotal * leanShare[s], 2);
      const pct = round((kg / leanIdeal[s]) * 100);
      return { kg, pct, evaluation: pct < 90 ? 'Under' : pct > 110 ? 'Over' : 'Normal' };
    });
    const fat = seg((s) => {
      const kg = round(fatKg * fatShare[s], 1);
      const pct = round((kg / fatIdeal[s]) * 100);
      return { kg, pct, evaluation: pct < 80 ? 'Under' : pct > 160 ? 'Over' : 'Normal' };
    });
    return { id, date, weightKg: round(weight), skeletalMuscleKg: round((weight - fatKg) * 0.55 * (1 + leanBoost)), bodyFatKg: fatKg, bodyFatPct: pbf, lean, fat, isSample: true };
  };
  const basePbf = (sex === 'male' ? 18.5 : 27.5) + j(1) * 2;
  return [
    make('sample-weigh-1', '2026-08-15', currentWeightKg + 1.2 + j(2) * 0.4, round(basePbf + 1.6), 0),
    make('sample-weigh-2', '2026-10-10', currentWeightKg, round(basePbf), 0.012),
  ];
}

export interface Change {
  key: string;
  label: string;
  unit: 'kg' | '%';
  from?: number;
  to?: number;
  delta?: number;
  /** Whether an increase is desirable. */
  good: 'up' | 'down';
}

/** Changes between two weigh-ins, whole body and per segment. */
export function compareWeighIns(prev: WeighIn, cur: WeighIn) {
  const ch = (key: string, label: string, from: number | undefined, to: number | undefined, good: 'up' | 'down', unit: 'kg' | '%' = 'kg'): Change => ({
    key,
    label,
    unit,
    from,
    to,
    delta: from !== undefined && to !== undefined ? round(to - from, 2) : undefined,
    good,
  });
  const totals = [
    ch('weight', 'Weight', prev.weightKg, cur.weightKg, 'down'),
    ch('smm', 'Skeletal muscle', prev.skeletalMuscleKg, cur.skeletalMuscleKg, 'up'),
    ch('fatKg', 'Body fat mass', prev.bodyFatKg, cur.bodyFatKg, 'down'),
    ch('pbf', 'Body fat', prev.bodyFatPct, cur.bodyFatPct, 'down', '%'),
    ch('leanTotal', 'Segmental lean total', segmentTotal(prev.lean), segmentTotal(cur.lean), 'up'),
    ch('fatTotal', 'Segmental fat total', segmentTotal(prev.fat), segmentTotal(cur.fat), 'down'),
  ];
  const lean = SEGMENTS.map(({ id, label }) => ch(`lean-${id}`, label, prev.lean[id]?.kg, cur.lean[id]?.kg, 'up'));
  const fat = SEGMENTS.map(({ id, label }) => ch(`fat-${id}`, label, prev.fat[id]?.kg, cur.fat[id]?.kg, 'down'));
  return { days: diffDays(cur.date, prev.date), totals, lean, fat, summary: summarise(totals, lean, fat) };
}

const fmt = (d: number, unit = 'kg') => `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(unit === '%' ? 1 : Math.abs(d) < 1 ? 2 : 1)}${unit === '%' ? ' pts' : ' kg'}`;
export const fmtDelta = fmt;

/** Plain-language analysis of what increased and what was lost. */
function summarise(totals: Change[], lean: Change[], fat: Change[]): string[] {
  const out: string[] = [];
  const get = (k: string) => totals.find((t) => t.key === k)?.delta;
  const weight = get('weight');
  const fatKg = get('fatKg') ?? get('fatTotal');
  const muscle = get('smm') ?? get('leanTotal');
  const pbf = get('pbf');
  const T = 0.05; // smaller changes count as unchanged

  if (weight !== undefined) out.push(Math.abs(weight) < T ? 'Weight is unchanged.' : `Weight ${weight < 0 ? 'down' : 'up'} ${Math.abs(weight).toFixed(1)} kg.`);
  const parts: string[] = [];
  if (fatKg !== undefined) parts.push(Math.abs(fatKg) < T ? 'fat mass held steady' : `${fatKg < 0 ? 'lost' : 'gained'} ${Math.abs(fatKg).toFixed(1)} kg of fat`);
  if (muscle !== undefined) parts.push(Math.abs(muscle) < T ? 'muscle held steady' : `${muscle > 0 ? 'gained' : 'lost'} ${Math.abs(muscle).toFixed(1)} kg of muscle`);
  if (parts.length) out.push(`You ${parts.join(' and ')}${pbf !== undefined && Math.abs(pbf) >= 0.1 ? ` (body fat ${fmt(pbf, '%')})` : ''}.`);

  if (fatKg !== undefined && muscle !== undefined) {
    if (fatKg <= -T && muscle >= -T) out.push('Fat loss while keeping muscle: on track for race weight.');
    else if (fatKg >= T && muscle >= T) out.push('Both muscle and fat went up: a building phase. Check intake if leaning out is the goal.');
    else if (muscle <= -T && fatKg <= -T) out.push('Some muscle was lost along with fat: keep protein up and strength sessions in the week.');
    else if (muscle <= -T && fatKg >= -T) out.push('Muscle is down without fat loss: look at recovery, sleep and protein.');
  }

  const moved = (list: Change[], dir: 1 | -1) => list.filter((c) => c.delta !== undefined && c.delta * dir >= 0.05).sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!));
  const name = (c: Change) => c.label.toLowerCase();
  const leanUp = moved(lean, 1);
  const leanDown = moved(lean, -1);
  const fatDown = moved(fat, -1);
  const fatUp = moved(fat, 1);
  if (leanUp.length) out.push(`Lean mass up in ${leanUp.map((c) => `${name(c)} (${fmt(c.delta!)})`).join(', ')}.`);
  if (leanDown.length) out.push(`Lean mass down in ${leanDown.map((c) => `${name(c)} (${fmt(c.delta!)})`).join(', ')}.`);
  if (fatDown.length) out.push(`Fat down in ${fatDown.map((c) => `${name(c)} (${fmt(c.delta!)})`).join(', ')}.`);
  if (fatUp.length) out.push(`Fat up in ${fatUp.map((c) => `${name(c)} (${fmt(c.delta!)})`).join(', ')}.`);

  // Left / right balance of the latest scan's limbs.
  for (const [a, b, part] of [[lean[0], lean[1], 'arms'], [lean[3], lean[4], 'legs']] as const) {
    if (a.to !== undefined && b.to !== undefined && Math.max(a.to, b.to) > 0) {
      const gap = Math.abs(a.to - b.to) / Math.max(a.to, b.to);
      if (gap >= 0.05) out.push(`Your ${a.to > b.to ? 'left' : 'right'} ${part.slice(0, -1)} carries ${Math.round(gap * 100)}% more lean mass: add single-side work for the ${a.to > b.to ? 'right' : 'left'}.`);
    }
  }
  return out;
}
