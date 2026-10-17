import type { BodySegment, SegmentReading } from '../data/types';

/**
 * Reads values from a photo or screenshot of a body composition printout
 * (InBody-style "Segmental Lean / Fat Analysis") with Tesseract OCR in the
 * browser. Results are a best guess: the athlete reviews them before saving.
 *
 * Approach: OCR the whole (enlarged) image to find the reliable "%" and
 * evaluation words, then read each kg value from a tight crop just above its
 * "%" (the dotted underline below the kg value confuses whole-page OCR),
 * voting across a few crop heights.
 */

const VERSION = '5.1.1';
/** Where Tesseract's worker, engine and English model are loaded from. */
export const OCR_ASSETS = {
  workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@${VERSION}/dist/worker.min.js`,
  corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${VERSION}`,
  langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
};

export interface ScanResult {
  lean: Partial<Record<BodySegment, SegmentReading>>;
  fat: Partial<Record<BodySegment, SegmentReading>>;
  weightKg?: number;
  skeletalMuscleKg?: number;
  bodyFatKg?: number;
  bodyFatPct?: number;
  /** Number of values found, for the "read N values" message. */
  found: number;
}

interface Word {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

const EVALUATIONS = ['Under', 'Normal', 'Over', 'Low', 'High', 'Below', 'Above'];

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Grayscale copy of (part of) the image, scaled up, optionally thresholded to black and white. */
function prepare(img: HTMLImageElement | HTMLCanvasElement, scale: number, crop?: { x: number; y: number; w: number; h: number }, threshold?: number) {
  const src = crop ?? { x: 0, y: 0, w: img.width, h: img.height };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(src.w * scale));
  canvas.height = Math.max(1, Math.round(src.h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    let g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (threshold !== undefined) g = g < threshold ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = g;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

const num = (s: string) => {
  const m = s.replace(',', '.').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
};

/** Most common value matching `pattern` among several readings of the same text. */
function vote(readings: string[], pattern: RegExp): number | undefined {
  const counts = new Map<number, number>();
  for (const r of readings) {
    const m = r.replace(',', '.').match(pattern);
    if (m) counts.set(Number(m[0]), (counts.get(Number(m[0])) ?? 0) + 1);
  }
  let best: number | undefined;
  let n = 0;
  counts.forEach((c, v) => {
    if (c > n) {
      best = v;
      n = c;
    }
  });
  return best;
}

/** Assigns the panel's readings to body parts by position: arms on top, trunk in the middle, legs at the bottom. */
function assignSegments(items: { x: number; y: number; reading: SegmentReading }[], rows: { top: number; bottom: number }): Partial<Record<BodySegment, SegmentReading>> {
  const out: Partial<Record<BodySegment, SegmentReading>> = {};
  if (!items.length) return out;
  const { top } = rows;
  const span = Math.max(1, rows.bottom - top);
  const xs = items.map((i) => i.x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  for (const it of items) {
    const rel = (it.y - top) / span;
    const row = rel < 0.25 ? 'arm' : rel > 0.75 ? 'leg' : 'trunk';
    // On the printout the athlete's left side is shown on the left ("Left" label).
    const seg: BodySegment = row === 'trunk' ? 'trunk' : `${it.x < mid ? 'left' : 'right'}${row === 'arm' ? 'Arm' : 'Leg'}` as BodySegment;
    out[seg] = it.reading;
  }
  return out;
}

/** Reads a body composition scan photo. `onProgress` receives 0–1. */
export async function readBodyScan(file: Blob, onProgress?: (p: number) => void): Promise<ScanResult> {
  const { createWorker, PSM } = await import('tesseract.js');
  const img = await loadImage(file);
  const worker = await createWorker('eng', 1, { ...OCR_ASSETS });
  const isPct = (t: string) => /^\d{1,3}(\.\d)?%$/.test(t);
  const ocrWords = async (src: HTMLCanvasElement, scale: number) => {
    const page = await worker.recognize(src);
    return {
      text: page.data.text,
      words: (page.data.words as Word[]).map((w) => ({ text: w.text, bbox: { x0: w.bbox.x0 / scale, y0: w.bbox.y0 / scale, x1: w.bbox.x1 / scale, y1: w.bbox.y1 / scale } })),
    };
  };
  try {
    onProgress?.(0.05);
    // 1. Read the page. Clear screenshots read best at their own size; try a couple of
    //    other sizes too and keep the one that finds the most "%" values.
    let best: { words: Word[]; text: string; count: number } | null = null;
    const scales = [img.naturalWidth < 600 ? 2 : 1, 1.6, 0.7];
    for (const [i, scale] of scales.entries()) {
      const { words, text } = await ocrWords(prepare(img, scale), scale);
      const count = words.filter((w) => isPct(w.text)).length;
      if (!best || count > best.count) best = { words, text, count };
      onProgress?.(0.05 + (0.3 * (i + 1)) / scales.length);
      if (count >= 10) break;
    }
    const { words, text } = best!;
    const base = img;
    // The fat panel starts at the "Segmental Fat Analysis" heading, else at the image's centre.
    const fatHeading = words.find((w, i) => /^Fat$/i.test(w.text) && /Segmental/i.test(words[i - 1]?.text ?? ''));
    const split = fatHeading ? words[words.indexOf(fatHeading) - 1].bbox.x0 - 5 : img.naturalWidth / 2;
    const pcts = words.filter((w) => isPct(w.text));
    const evals = words.filter((w) => EVALUATIONS.some((e) => e.toLowerCase() === w.text.toLowerCase()));

    // 3. Read each kg value from a tight crop just above its "%" (the dotted underline
    //    below the kg value confuses whole-page OCR), voting across crop sizes.
    await worker.setParameters({ tessedit_char_whitelist: '0123456789.kg', tessedit_pageseg_mode: PSM.SINGLE_LINE });
    const lean: { x: number; y: number; reading: SegmentReading }[] = [];
    const fat: { x: number; y: number; reading: SegmentReading }[] = [];
    let done = 0;
    for (const p of pcts) {
      const b = p.bbox;
      const h = b.y1 - b.y0;
      const w = b.x1 - b.x0;
      const readings: string[] = [];
      for (const [t, bt] of [[2.1, 0.9], [2.0, 0.8], [2.2, 0.95], [2.05, 0.85]]) {
        const crop = { x: Math.max(0, b.x0 - 0.3 * w), y: Math.max(0, b.y0 - t * h), w: w * 1.6, h: (t - bt) * h };
        // Read at ~15px and ~40px text height, whatever the photo's size.
        for (const sc of [15 / Math.max(1, h), 40 / Math.max(1, h)]) readings.push((await worker.recognize(prepare(base, sc, crop))).data.text.trim());
      }
      // Re-read the "%" the same way; whole-page OCR sometimes drops its decimal point.
      await worker.setParameters({ tessedit_char_whitelist: '0123456789.%' });
      const pctReadings = [p.text];
      const pctCrop = { x: Math.max(0, b.x0 - 0.15 * w), y: Math.max(0, b.y0 - 0.25 * h), w: w * 1.3, h: h * 1.5 };
      for (const sc of [15 / Math.max(1, h), 40 / Math.max(1, h)]) pctReadings.push((await worker.recognize(prepare(base, sc, pctCrop))).data.text.trim());
      await worker.setParameters({ tessedit_char_whitelist: '0123456789.kg' });
      const evaluation = evals.find((e) => e.bbox.y0 > b.y0 && e.bbox.y0 - b.y1 < 2.5 * h && Math.abs((e.bbox.x0 + e.bbox.x1) / 2 - (b.x0 + b.x1) / 2) < 1.5 * w);
      const reading: SegmentReading = {
        kg: vote(readings, /\d{1,3}\.\d{1,2}/),
        pct: vote(pctReadings, /\d{2,3}\.\d/) ?? num(p.text),
        evaluation: evaluation ? evaluation.text[0].toUpperCase() + evaluation.text.slice(1).toLowerCase() : undefined,
      };
      (b.x0 >= split ? fat : lean).push({ x: (b.x0 + b.x1) / 2, y: b.y0, reading });
      onProgress?.(0.35 + (0.6 * ++done) / pcts.length);
    }

    // Both panels share the same rows: arms on top, trunk in the middle, legs at the bottom.
    const ys = [...lean, ...fat].map((i) => i.y);
    const rows = { top: Math.min(...ys), bottom: Math.max(...ys) };

    // Whole-body figures on a full InBody sheet, when present.
    const after = (label: RegExp) => {
      const m = text.match(label);
      return m ? num(m[1]) : undefined;
    };
    const result: ScanResult = {
      lean: assignSegments(lean, rows),
      fat: assignSegments(fat, rows),
      weightKg: after(/Weight[^\d]{0,20}(\d{2,3}(?:\.\d)?)/i),
      skeletalMuscleKg: after(/Skeletal\s*Muscle\s*Mass[^\d]{0,20}(\d{1,3}(?:\.\d)?)/i),
      bodyFatKg: after(/Body\s*Fat\s*Mass[^\d]{0,20}(\d{1,3}(?:\.\d)?)/i),
      bodyFatPct: after(/(?:Percent\s*Body\s*Fat|PBF)[^\d]{0,20}(\d{1,2}(?:\.\d)?)/i),
      found: 0,
    };
    result.found =
      [result.weightKg, result.skeletalMuscleKg, result.bodyFatKg, result.bodyFatPct].filter((v) => v !== undefined).length +
      [...Object.values(result.lean), ...Object.values(result.fat)].reduce((a, r) => a + (r?.kg !== undefined ? 1 : 0), 0);
    onProgress?.(1);
    return result;
  } finally {
    await worker.terminate();
  }
}

/** Downscaled JPEG copy of the photo for storage with the weigh-in. */
export async function compressImage(file: Blob, maxSide = 900, quality = 0.72): Promise<string> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
