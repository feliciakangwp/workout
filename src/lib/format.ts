export const fmtPace = (secPerKm: number) => {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '–';
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtTime = (sec: number) => {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};

export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

export const fmtKg = (kg: number) => `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;

export const pctChange = (current: number, previous: number) =>
  previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / previous) * 100;

export const fmtPct = (v: number, digits = 0) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;

/**
 * Parses "m:ss" or "h:mm:ss" into seconds; dots work like colons ("5.00" = 5:00, easier
 * on a phone number pad; "4.3" = 4:30) and a plain number is minutes ("5" = 5:00). NaN when invalid.
 */
export const parseTime = (text: string) => {
  const raw = text.trim();
  if (!raw) return NaN;
  const pieces = raw.replace(/\./g, ':').split(':');
  // "4.3" reads like "4.30": one digit after a dot is tens of seconds.
  if (pieces.length > 1 && raw.includes('.') && /^\d$/.test(pieces[pieces.length - 1])) pieces[pieces.length - 1] += '0';
  const parts = pieces.map((p) => (p === '' ? NaN : Number(p)));
  if (parts.some((p) => !isFinite(p) || p < 0)) return NaN;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.slice(1).some((p) => p >= 60)) return NaN; // seconds and minutes after the first part stay under 60
  return parts.reduce((acc, p) => acc * 60 + p, 0);
};

export const round = (v: number, step: number) => Math.round(v / step) * step;

/** "1:52:10 – 1:58:40", or one time when both ends match. */
export const fmtRange = (a: number, b: number) => (Math.round(a) === Math.round(b) ? fmtTime(a) : `${fmtTime(a)} – ${fmtTime(b)}`);
