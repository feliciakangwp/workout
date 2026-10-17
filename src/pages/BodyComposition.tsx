import { Droplet, Dumbbell, Image as ImageIcon, Info, Lightbulb, Percent, Plus, Scale, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader, ChartTooltip, EmptyState, Modal, PageHeader, Segmented, StatCard, TrendBadge } from '../components/ui';
import { WeighInModal } from '../components/WeighInModal';
import { useData } from '../context/DataContext';
import type { BodySegment, WeighIn } from '../data/types';
import { type Change, compareWeighIns, fmtDelta, segmentTotal } from '../lib/analytics/body';
import { fmtLong, fmtShort } from '../lib/dates';
import { AXIS, GRID, SERIES } from '../lib/theme';

type Panel = 'lean' | 'fat';
type Metric = 'weight' | 'muscle' | 'lean' | 'fat' | 'pbf';

const METRICS: { value: Metric; label: string; unit: string; color: string; get: (w: WeighIn) => number | undefined }[] = [
  { value: 'weight', label: 'Weight', unit: 'kg', color: SERIES.blue, get: (w) => w.weightKg },
  { value: 'muscle', label: 'Muscle', unit: 'kg', color: SERIES.aqua, get: (w) => w.skeletalMuscleKg },
  { value: 'lean', label: 'Lean total', unit: 'kg', color: SERIES.green, get: (w) => segmentTotal(w.lean) },
  { value: 'fat', label: 'Fat mass', unit: 'kg', color: SERIES.orange, get: (w) => w.bodyFatKg ?? segmentTotal(w.fat) },
  { value: 'pbf', label: 'Body fat %', unit: '%', color: SERIES.magenta, get: (w) => w.bodyFatPct },
];

const EVAL_TONE: Record<string, string> = {
  Under: 'bg-sky-50 text-sky-700 ring-sky-200',
  Normal: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Over: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const deltaBadge = (c?: Change) => (c?.delta !== undefined ? { delta: c.delta, deltaLabel: fmtDelta(c.delta, c.unit) } : {});

export function BodyComposition() {
  const { weighIns, readOnly, removeWeighIn, athlete } = useData();
  const [adding, setAdding] = useState(false);
  const [panel, setPanel] = useState<Panel>('lean');
  const [metric, setMetric] = useState<Metric>('weight');
  const [viewing, setViewing] = useState<WeighIn | null>(null);
  const latest = weighIns[weighIns.length - 1];
  const earlier = weighIns.slice(0, -1);
  const [compareId, setCompareId] = useState<string | null>(null);
  const prev = earlier.find((w) => w.id === compareId) ?? earlier[earlier.length - 1];
  const cmp = useMemo(() => (latest && prev ? compareWeighIns(prev, latest) : null), [latest, prev]);
  const samples = weighIns.some((w) => w.isSample);
  // Only metrics the athlete has recorded can be charted.
  const metrics = METRICS.filter((x) => weighIns.filter((w) => x.get(w) !== undefined).length > 1);
  const m = METRICS.find((x) => x.value === metric && metrics.includes(x)) ?? metrics[0] ?? METRICS[0];
  const chart = weighIns.map((w) => ({ date: w.date, value: m.get(w) })).filter((p) => p.value !== undefined);
  const total = (k: string) => cmp?.totals.find((t) => t.key === k);

  return (
    <div>
      <PageHeader
        title="Body Composition"
        subtitle={readOnly ? `${athlete.displayName}'s weigh-ins.` : 'Upload your scan after each weigh-in to track weight, muscle and fat by body part.'}
        actions={!readOnly && <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add weigh-in</button>}
      />

      {samples && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p><b className="font-semibold">Example weigh-ins.</b> These two scans are invented to show the analysis. They disappear once {readOnly ? 'this athlete adds' : 'you add'} a real weigh-in.</p>
        </div>
      )}

      {!latest ? (
        <EmptyState title="No weigh-ins yet" text="Add a weigh-in and upload a photo of your body composition scan." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard icon={Scale} label="Weight" value={latest.weightKg?.toFixed(1) ?? '—'} unit="kg" good="down" {...deltaBadge(total('weight'))} comparison={prev ? `vs ${fmtShort(prev.date)}` : fmtLong(latest.date)} />
            <StatCard icon={Dumbbell} label={latest.skeletalMuscleKg === undefined && segmentTotal(latest.lean) !== undefined ? 'Lean mass' : 'Skeletal muscle'} value={(latest.skeletalMuscleKg ?? segmentTotal(latest.lean))?.toFixed(1) ?? '—'} unit="kg" accent="emerald" {...deltaBadge(total('smm')?.delta !== undefined ? total('smm') : total('leanTotal'))} comparison={latest.skeletalMuscleKg === undefined && segmentTotal(latest.lean) !== undefined ? 'sum of the 5 segments' : undefined} />
            <StatCard icon={Droplet} label="Body fat mass" comparison={latest.bodyFatKg === undefined && segmentTotal(latest.fat) !== undefined ? 'sum of the 5 segments' : undefined} value={(latest.bodyFatKg ?? segmentTotal(latest.fat))?.toFixed(1) ?? '—'} unit="kg" accent="amber" good="down" {...deltaBadge(total('fatKg')?.delta !== undefined ? total('fatKg') : total('fatTotal'))} />
            <StatCard icon={Percent} label="Body fat" value={latest.bodyFatPct?.toFixed(1) ?? '—'} unit="%" accent="rose" good="down" {...deltaBadge(total('pbf'))} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader
                icon={Scale}
                title="Segmental analysis"
                subtitle={`${fmtLong(latest.date)}${prev ? ` · change since ${fmtShort(prev.date)}` : ''}`}
                action={<Segmented value={panel} onChange={setPanel} options={[{ value: 'lean', label: 'Lean (muscle)' }, { value: 'fat', label: 'Fat' }]} />}
              />
              <div className="p-4 sm:p-5">
                <BodyGrid weighIn={latest} panel={panel} changes={cmp ? (panel === 'lean' ? cmp.lean : cmp.fat) : undefined} />
              </div>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader
                icon={Lightbulb}
                title={prev ? 'What changed' : 'Analysis'}
                subtitle={cmp ? `${cmp.days} days between weigh-ins` : undefined}
                action={
                  earlier.length > 1 && (
                    <select aria-label="Compare with" className="input w-auto py-1 text-xs" value={prev?.id} onChange={(e) => setCompareId(e.target.value)}>
                      {[...earlier].reverse().map((w) => <option key={w.id} value={w.id}>vs {fmtShort(w.date)} {w.date.slice(0, 4)}</option>)}
                    </select>
                  )
                }
              />
              <div className="p-4 sm:p-5">
                {cmp ? (
                  <>
                    <ul className="space-y-2 text-sm text-slate-700">
                      {cmp.summary.map((s) => (
                        <li key={s} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />{s}</li>
                      ))}
                    </ul>
                    <div className="mt-4 divide-y divide-slate-100 rounded-xl bg-slate-50 px-3 text-sm">
                      {cmp.totals.filter((t) => t.delta !== undefined).map((t) => (
                        <div key={t.key} className="flex items-center justify-between gap-2 py-2">
                          <span className="text-slate-600">{t.label}</span>
                          <span className="flex items-center gap-2 text-slate-500">
                            <span className="hidden sm:inline">{t.from}{t.unit === '%' ? '%' : ''} → <b className="font-semibold text-slate-900">{t.to}{t.unit === '%' ? '%' : ' kg'}</b></span>
                            <TrendBadge delta={t.delta!} label={fmtDelta(t.delta!, t.unit)} good={t.good} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Add your next weigh-in to see what increased and what was lost.</p>
                )}
              </div>
            </Card>
          </div>

          {chart.length > 1 && (
            <Card className="mt-5">
              <CardHeader icon={Scale} title="Trend" subtitle="All weigh-ins" action={<Segmented value={m.value} onChange={setMetric} options={metrics.map(({ value, label }) => ({ value, label }))} />} />
              <div className="h-60 p-3 sm:p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="date" tickFormatter={fmtShort} {...AXIS} minTickGap={16} />
                    <YAxis {...AXIS} domain={[(lo: number) => Math.floor(lo - 1), (hi: number) => Math.ceil(hi + 1)]} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip labelFormatter={(l) => fmtLong(String(l))} valueFormatter={(v) => `${v} ${m.unit}`} />} />
                    <Line type="monotone" dataKey="value" name={m.label} stroke={m.color} strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card className="mt-5">
            <CardHeader title="Weigh-in history" subtitle={`${weighIns.length} weigh-in${weighIns.length === 1 ? '' : 's'}`} />
            <ul className="divide-y divide-slate-100 px-4 pb-2 sm:px-5">
              {[...weighIns].reverse().map((w) => (
                <li key={w.id} className="flex items-center gap-3 py-3">
                  <button
                    className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400"
                    onClick={() => setViewing(w)}
                    aria-label={`View weigh-in ${fmtLong(w.date)}`}
                  >
                    {w.image ? <img src={w.image} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={18} />}
                  </button>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setViewing(w)}>
                    <p className="text-sm font-medium text-slate-800">{fmtLong(w.date)}{w.isSample && <span className="ml-2 text-[11px] font-normal text-amber-700">example</span>}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[w.weightKg !== undefined && `${w.weightKg} kg`, w.skeletalMuscleKg !== undefined && `muscle ${w.skeletalMuscleKg} kg`, w.bodyFatPct !== undefined && `fat ${w.bodyFatPct}%`, w.notes].filter(Boolean).join(' · ') || 'Segmental values only'}
                    </p>
                  </button>
                  {!readOnly && !w.isSample && (
                    <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete weigh-in ${fmtLong(w.date)}`} onClick={() => confirm('Delete this weigh-in?') && removeWeighIn(w.id)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {adding && <WeighInModal onClose={() => setAdding(false)} />}
      {viewing && (
        <Modal open wide onClose={() => setViewing(null)} title={`Weigh-in · ${fmtLong(viewing.date)}`}>
          {viewing.image && <img src={viewing.image} alt="Body composition scan" className="mb-4 max-h-[50vh] w-full rounded-lg bg-slate-50 object-contain" />}
          <div className="grid gap-4 lg:grid-cols-2">
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">Lean (muscle)</p><BodyGrid weighIn={viewing} panel="lean" /></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Fat</p><BodyGrid weighIn={viewing} panel="fat" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Body-shaped layout like the scan printout: arms on top, trunk in the middle, legs at the bottom. */
function BodyGrid({ weighIn, panel, changes }: { weighIn: WeighIn; panel: Panel; changes?: Change[] }) {
  const seg = panel === 'lean' ? weighIn.lean : weighIn.fat;
  const tile = (id: BodySegment, label: string) => {
    const r = seg[id];
    const c = changes?.find((x) => x.key === `${panel}-${id}`);
    return (
      <div className={`rounded-xl border p-2.5 text-center ${panel === 'lean' ? 'border-blue-100 bg-blue-50/40' : 'border-amber-100 bg-amber-50/40'}`}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 text-lg font-semibold text-slate-900">{r?.kg !== undefined ? r.kg : '—'}<span className="ml-0.5 text-xs font-medium text-slate-500">kg</span></p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1 text-[11px]">
          {r?.pct !== undefined && <span className="text-slate-500">{r.pct}%</span>}
          {r?.evaluation && <span className={`rounded-full px-1.5 py-px font-medium ring-1 ring-inset ${EVAL_TONE[r.evaluation] ?? 'bg-slate-100 text-slate-600 ring-slate-200'}`}>{r.evaluation}</span>}
        </div>
        {c?.delta !== undefined && <div className="mt-1.5"><TrendBadge delta={c.delta} label={fmtDelta(c.delta)} good={c.good} /></div>}
      </div>
    );
  };
  return (
    <div className="relative grid grid-cols-3 gap-2">
      <svg viewBox="0 0 100 160" className="pointer-events-none absolute inset-0 m-auto h-full w-1/3 text-slate-200" aria-hidden>
        <circle cx="50" cy="14" r="11" fill="currentColor" />
        <path d="M30 30h40l8 50h-10l-2 76H56l-6-56-6 56H34l-2-76H22z" fill="currentColor" />
      </svg>
      {tile('leftArm', 'Left arm')}
      <div />
      {tile('rightArm', 'Right arm')}
      <div />
      <div className="relative">{tile('trunk', 'Trunk')}</div>
      <div />
      {tile('leftLeg', 'Left leg')}
      <div />
      {tile('rightLeg', 'Right leg')}
    </div>
  );
}
