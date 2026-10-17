import type { MuscleGroup } from '../data/types';
import { MUSCLE_BY_ID } from '../data/muscles';

/**
 * Simplified anatomical body map. Shapes are drawn for the viewer's left side
 * and mirrored; centre-line shapes are drawn once.
 */
interface Region {
  muscle: MuscleGroup;
  d: string;
  mirror: boolean;
}

const FRONT: Region[] = [
  { muscle: 'shoulders', mirror: true, d: 'M69 68 Q56 69 51 84 Q49 95 53 104 Q59 92 72 87 Q77 76 69 68 Z' },
  { muscle: 'chest', mirror: true, d: 'M98.5 73 L77 72 Q70 78 70 92 Q74 106 98.5 105 Z' },
  { muscle: 'biceps', mirror: true, d: 'M54 106 Q48 119 47 137 Q52 142 57.5 141 Q63 124 64.5 104 Q60 99 54 106 Z' },
  { muscle: 'core', mirror: false, d: 'M87 109 L113 109 L112 168 Q100 180 88 168 Z' },
  { muscle: 'core', mirror: true, d: 'M72 106 Q75 132 77 160 L84.5 170 L84.5 109 Z' },
  { muscle: 'quadriceps', mirror: true, d: 'M76 196 Q69 232 76 270 Q85 279 95 272 Q99.5 240 98.5 202 Q87 196 76 196 Z' },
  { muscle: 'calves', mirror: true, d: 'M80 292 Q74 322 82 356 L92 356 Q98 322 96 292 Q88 286 80 292 Z' },
];

const BACK: Region[] = [
  { muscle: 'back', mirror: true, d: 'M99 57 L89 62 L72 69 Q86 76 99 94 Z' },
  { muscle: 'shoulders', mirror: true, d: 'M69 70 Q56 70 51 84 Q49 95 53 104 Q59 92 72 87 Q76 77 69 70 Z' },
  { muscle: 'back', mirror: true, d: 'M73 86 Q69 112 78 150 Q90 140 98.5 130 L98.5 99 Q87 84 73 86 Z' },
  { muscle: 'triceps', mirror: true, d: 'M54 106 Q48 119 47 137 Q52 142 57.5 141 Q63 124 64.5 104 Q60 99 54 106 Z' },
  { muscle: 'core', mirror: true, d: 'M86 140 L98.5 134 L98.5 180 L82 176 Q84 156 86 140 Z' },
  { muscle: 'glutes', mirror: true, d: 'M76 186 Q71 202 76 216 Q88 226 98.5 218 L98.5 186 Q88 181 76 186 Z' },
  { muscle: 'hamstrings', mirror: true, d: 'M76 222 Q71 250 78 274 L96 274 Q100.5 248 98.5 224 Q88 230 76 222 Z' },
  { muscle: 'calves', mirror: true, d: 'M78 290 Q71 314 80 342 Q86 349 92 342 Q101 314 96 290 Q87 284 78 290 Z' },
];

/** Grey underlay for untracked body parts. */
function Silhouette() {
  const half = (
    <>
      <path d="M67 68 Q54 70 50 88 L43 140 L57.5 144 L66 100 Z" />
      <path d="M43 140 L37 196 L47 198 L58 144 Z" />
      <ellipse cx="41.5" cy="208" rx="6" ry="11" />
      <path d="M74 184 L100 194 L99 282 L78 284 Q69 240 72 200 Z" />
      <path d="M78 286 L99 286 L95 380 L82 380 Q73 330 78 286 Z" />
      <path d="M82 380 L95 380 L97 396 L75 396 Q76 386 82 380 Z" />
    </>
  );
  return (
    <g fill="#e2e8f0">
      <ellipse cx="100" cy="32" rx="17" ry="21" />
      <path d="M90 50 L110 50 L113 66 L87 66 Z" />
      <path d="M68 66 Q100 58 132 66 L136 92 Q134 130 128 160 L127 192 Q100 202 73 192 L72 160 Q66 130 64 92 Z" />
      {half}
      <g transform="translate(200 0) scale(-1 1)">{half}</g>
    </g>
  );
}

export function BodyFigure({
  view,
  colors,
  selected,
  hovered,
  onSelect,
  onHover,
  emphasis,
}: {
  view: 'front' | 'back';
  /** Muscles drawn with a bold outline (e.g. relay focus). */
  emphasis?: Set<MuscleGroup>;
  colors: Record<MuscleGroup, string>;
  selected: MuscleGroup | null;
  hovered: MuscleGroup | null;
  onSelect: (m: MuscleGroup) => void;
  onHover: (m: MuscleGroup | null) => void;
}) {
  const regions = view === 'front' ? FRONT : BACK;
  const shape = (r: Region, i: number, mirrored: boolean) => {
    const active = selected === r.muscle;
    const hot = hovered === r.muscle;
    return (
      <path
        key={`${i}-${mirrored}`}
        d={r.d}
        transform={mirrored ? 'translate(200 0) scale(-1 1)' : undefined}
        fill={colors[r.muscle]}
        stroke={active ? '#1d4ed8' : emphasis?.has(r.muscle) ? '#1e3a8a' : '#ffffff'}
        strokeWidth={active ? 2.6 : emphasis?.has(r.muscle) ? 2 : 1.2}
        opacity={hovered && !hot && !active ? 0.75 : 1}
        className="cursor-pointer transition-opacity"
        onClick={() => onSelect(r.muscle)}
        onMouseEnter={() => onHover(r.muscle)}
        onMouseLeave={() => onHover(null)}
      >
        <title>{MUSCLE_BY_ID[r.muscle].label}</title>
      </path>
    );
  };
  return (
    <svg viewBox="30 6 140 396" className="h-full w-full" role="group" aria-label={`${view} view muscle map`}>
      <Silhouette />
      {view === 'back' && <path d="M100 58 L100 180" stroke="#cbd5e1" strokeWidth="0.8" />}
      {regions.map((r, i) => (
        <g key={i}>
          {shape(r, i, false)}
          {r.mirror && shape(r, i, true)}
        </g>
      ))}
    </svg>
  );
}
