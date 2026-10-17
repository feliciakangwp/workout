import { Camera, ImageUp, Loader2, ScanLine, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from './ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import type { BodySegment, SegmentReading, WeighIn } from '../data/types';
import { EVALUATION_OPTIONS, SEGMENTS } from '../lib/analytics/body';
import { compressImage, readBodyScan, type ScanResult } from '../lib/bodyScanOcr';

type SegForm = Record<BodySegment, { kg: string; pct: string; evaluation: string }>;
const emptySegs = (): SegForm => Object.fromEntries(SEGMENTS.map(({ id }) => [id, { kg: '', pct: '', evaluation: '' }])) as SegForm;
const str = (v?: number) => (v === undefined ? '' : String(v));
const toNum = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Adds a weigh-in: upload the scan photo, read its values, review and save. */
export function WeighInModal({ onClose }: { onClose: () => void }) {
  const { backend } = useAuth();
  const { today, addWeighIn } = useData();
  const { notify } = useUI();
  const [date, setDate] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [whole, setWhole] = useState({ weightKg: '', skeletalMuscleKg: '', bodyFatKg: '', bodyFatPct: '' });
  const [lean, setLean] = useState<SegForm>(emptySegs);
  const [fat, setFat] = useState<SegForm>(emptySegs);
  const [notes, setNotes] = useState('');
  const [reading, setReading] = useState<number | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const apply = (r: ScanResult) => {
    setWhole((w) => ({
      weightKg: str(r.weightKg) || w.weightKg,
      skeletalMuscleKg: str(r.skeletalMuscleKg) || w.skeletalMuscleKg,
      bodyFatKg: str(r.bodyFatKg) || w.bodyFatKg,
      bodyFatPct: str(r.bodyFatPct) || w.bodyFatPct,
    }));
    const merge = (cur: SegForm, found: Partial<Record<BodySegment, SegmentReading>>) =>
      Object.fromEntries(
        SEGMENTS.map(({ id }) => {
          const f = found[id];
          return [id, { kg: str(f?.kg) || cur[id].kg, pct: str(f?.pct) || cur[id].pct, evaluation: f?.evaluation && EVALUATION_OPTIONS.includes(f.evaluation) ? f.evaluation : cur[id].evaluation }];
        }),
      ) as SegForm;
    setLean((c) => merge(c, r.lean));
    setFat((c) => merge(c, r.fat));
  };

  const read = async () => {
    if (!file) return;
    setStatus(null);
    setReading(0);
    try {
      let result: ScanResult | null = null;
      let how = 'on this device';
      if (backend.readBodyScan) {
        try {
          const dataUrl = await compressImage(file, 1600, 0.85);
          setReading(0.3);
          result = await backend.readBodyScan(dataUrl.split(',')[1], 'image/jpeg');
          how = 'with AI';
        } catch {
          // Edge function not deployed or failed: read it on-device instead.
        }
      }
      result ??= await readBodyScan(file, setReading);
      apply(result);
      setStatus(
        result.found
          ? { tone: result.found >= 10 ? 'ok' : 'warn', text: `Read ${result.found} values ${how}. Check them against your scan before saving.` }
          : { tone: 'warn', text: "Couldn't read values from this photo. Try a sharper, straight-on photo or enter them below." },
      );
    } catch (e) {
      setStatus({ tone: 'error', text: `Reading failed: ${e instanceof Error ? e.message : 'unknown error'}. Enter the values below.` });
    } finally {
      setReading(null);
    }
  };

  const save = async () => {
    const segs = (f: SegForm) =>
      Object.fromEntries(
        SEGMENTS.flatMap(({ id }) => {
          const r: SegmentReading = { kg: toNum(f[id].kg), pct: toNum(f[id].pct), evaluation: f[id].evaluation || undefined };
          return r.kg === undefined && r.pct === undefined && !r.evaluation ? [] : [[id, r]];
        }),
      );
    const entry: Omit<WeighIn, 'id' | 'isSample'> = {
      date,
      weightKg: toNum(whole.weightKg),
      skeletalMuscleKg: toNum(whole.skeletalMuscleKg),
      bodyFatKg: toNum(whole.bodyFatKg),
      bodyFatPct: toNum(whole.bodyFatPct),
      lean: segs(lean),
      fat: segs(fat),
      notes: notes.trim() || undefined,
    };
    const hasValues = [entry.weightKg, entry.skeletalMuscleKg, entry.bodyFatKg, entry.bodyFatPct].some((v) => v !== undefined) || Object.keys(entry.lean).length || Object.keys(entry.fat).length;
    if (!hasValues) return setError('Enter at least one value, or read them from your scan photo.');
    if (date > today) return setError("The weigh-in date can't be in the future.");
    setSaving(true);
    try {
      if (file) entry.image = await compressImage(file);
    } catch {
      // Save without the photo if it can't be processed.
    }
    addWeighIn(entry);
    notify('Weigh-in saved');
    onClose();
  };

  const segTable = (title: string, value: SegForm, set: (f: SegForm) => void, tone: string) => (
    <fieldset className="rounded-xl border border-slate-200 p-3">
      <legend className={`px-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</legend>
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5.5rem] items-center gap-x-2 gap-y-1.5 text-xs">
        <span />
        <span className="text-slate-500">kg</span>
        <span className="text-slate-500">%</span>
        <span className="text-slate-500">Evaluation</span>
        {SEGMENTS.map(({ id, label }) => (
          <div key={id} className="contents">
            <span className="truncate font-medium text-slate-700">{label}</span>
            <input aria-label={`${title} ${label} kg`} inputMode="decimal" className="input px-2 py-1.5" value={value[id].kg} onChange={(e) => set({ ...value, [id]: { ...value[id], kg: e.target.value } })} />
            <input aria-label={`${title} ${label} %`} inputMode="decimal" className="input px-2 py-1.5" value={value[id].pct} onChange={(e) => set({ ...value, [id]: { ...value[id], pct: e.target.value } })} />
            <select aria-label={`${title} ${label} evaluation`} className="input px-1.5 py-1.5" value={value[id].evaluation} onChange={(e) => set({ ...value, [id]: { ...value[id], evaluation: e.target.value } })}>
              <option value="">—</option>
              {EVALUATION_OPTIONS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>
    </fieldset>
  );

  const wholeField = (key: keyof typeof whole, label: string) => (
    <div>
      <label className="label" htmlFor={`wi-${key}`}>{label}</label>
      <input id={`wi-${key}`} inputMode="decimal" className="input" value={whole[key]} onChange={(e) => setWhole({ ...whole, [key]: e.target.value })} />
    </div>
  );

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Add weigh-in"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving || reading !== null}>{saving ? 'Saving…' : 'Save weigh-in'}</button>
        </>
      }
    >
      {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div>
            <label className="label" htmlFor="wi-date">Date</label>
            <input id="wi-date" type="date" className="input" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <span className="label">Scan photo</span>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 px-3 py-2.5 text-sm text-blue-700 hover:bg-blue-50">
              {file ? <ImageUp size={16} /> : <Camera size={16} />}
              <span className="truncate">{file ? file.name : 'Upload or take a photo of your body composition scan'}</span>
              <input type="file" accept="image/*" className="sr-only" aria-label="Scan photo" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setStatus(null); }} />
            </label>
          </div>
        </div>

        {preview && (
          <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
            <img src={preview} alt="Uploaded scan" className="max-h-48 w-full rounded-lg bg-white object-contain sm:w-64" />
            <div className="min-w-0 flex-1 space-y-2">
              <button className="btn-primary" onClick={read} disabled={reading !== null}>
                {reading !== null ? <Loader2 size={15} className="animate-spin" /> : backend.readBodyScan ? <Sparkles size={15} /> : <ScanLine size={15} />}
                {reading !== null ? `Reading… ${Math.round(reading * 100)}%` : 'Read values from photo'}
              </button>
              {status && <p className={`text-xs ${status.tone === 'ok' ? 'text-emerald-700' : status.tone === 'warn' ? 'text-amber-700' : 'text-rose-700'}`} role="status">{status.text}</p>}
              {!status && <p className="text-xs text-slate-500">Works best with a clear, straight-on screenshot or photo of the Segmental Lean / Fat Analysis.</p>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {wholeField('weightKg', 'Weight (kg)')}
          {wholeField('skeletalMuscleKg', 'Skeletal muscle (kg)')}
          {wholeField('bodyFatKg', 'Body fat mass (kg)')}
          {wholeField('bodyFatPct', 'Body fat (%)')}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {segTable('Segmental lean (muscle)', lean, setLean, 'text-blue-700')}
          {segTable('Segmental fat', fat, setFat, 'text-amber-700')}
        </div>

        <div>
          <label className="label" htmlFor="wi-notes">Notes</label>
          <input id="wi-notes" className="input" placeholder="e.g. morning, fasted" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
