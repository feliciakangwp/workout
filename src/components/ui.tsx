import { ChevronDown, X, TrendingDown, TrendingUp, Minus, FlaskConical } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import type { WorkoutType } from '../data/types';
import { TYPE_BADGE } from '../lib/theme';
import { useHasSampleData } from '../context/DataContext';

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={`card ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, icon: Icon }: { title: string; subtitle?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 rounded-lg bg-blue-50 p-1.5 text-blue-600">
            <Icon size={16} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const openKey = (id: string) => `hyrox-dashboard.open.${id}`;

/** Opens a collapsible card from elsewhere (e.g. a link that scrolls to it). */
export const openSection = (id: string) => window.dispatchEvent(new CustomEvent('open-section', { detail: id }));

/**
 * A card that starts collapsed to a short summary, for one-page overviews.
 * Tap the header or summary to open it; the choice is remembered on this device.
 */
export function CollapsibleCard({
  id,
  title,
  subtitle,
  icon: Icon,
  action,
  summary,
  children,
  className = '',
}: {
  id: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(openKey(id)) === '1';
    } catch {
      return false;
    }
  });
  const toggle = (next = !open) => {
    setOpen(next);
    try {
      localStorage.setItem(openKey(id), next ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };
  useEffect(() => {
    const onOpen = (e: Event) => (e as CustomEvent<string>).detail === id && toggle(true);
    window.addEventListener('open-section', onOpen);
    return () => window.removeEventListener('open-section', onOpen);
  });
  return (
    <Card className={`scroll-mt-20 ${className}`} id={id}>
      <div className="flex items-start gap-2 px-4 pt-4 sm:px-5 sm:pt-5">
        <button className="flex min-w-0 flex-1 items-start gap-2.5 text-left" onClick={() => toggle()} aria-expanded={open}>
          {Icon && (
            <span className="mt-0.5 rounded-lg bg-blue-50 p-1.5 text-blue-600">
              <Icon size={16} />
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-slate-900">{title}</span>
            {open && subtitle && <span className="mt-0.5 block text-xs text-slate-500">{subtitle}</span>}
          </span>
        </button>
        {action}
        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => toggle()} aria-label={open ? `Collapse ${title}` : `Expand ${title}`}>
          <ChevronDown size={18} className={`transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open ? (
        children
      ) : (
        <button className="block w-full px-4 pb-4 pt-2 text-left sm:px-5" onClick={() => toggle(true)}>
          {summary}
          <span className="mt-1.5 block text-xs font-medium text-blue-600">Show details</span>
        </button>
      )}
    </Card>
  );
}

export type Trend = 'up' | 'down' | 'flat';

/** `good` decides colouring: whether an increase is desirable for this metric. */
export function TrendBadge({ delta, label, good = 'up' }: { delta: number; label: string; good?: 'up' | 'down' }) {
  const dir: Trend = Math.abs(delta) < 1e-9 ? 'flat' : delta > 0 ? 'up' : 'down';
  const positive = dir !== 'flat' && dir === good;
  const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus;
  const tone = dir === 'flat' ? 'bg-slate-100 text-slate-600' : positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  deltaLabel,
  comparison,
  good = 'up',
  accent = 'blue',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  comparison?: string;
  good?: 'up' | 'down';
  accent?: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'sky';
}) {
  const accents: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    violet: 'bg-violet-50 text-violet-600',
    sky: 'bg-sky-50 text-sky-600',
  };
  return (
    <Card className="p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-1">
        <span className={`rounded-xl p-2 ${accents[accent]}`}>
          <Icon size={18} />
        </span>
        {delta !== undefined && deltaLabel && <TrendBadge delta={delta} label={deltaLabel} good={good} />}
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-slate-500">{unit}</span>}
      </p>
      {comparison && <p className="mt-1 text-xs text-slate-500">{comparison}</p>}
    </Card>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'sm' }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md font-medium transition ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${
            value === o.value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const RANGE_OPTIONS = [
  { value: '7d' as const, label: '7 days' },
  { value: '30d' as const, label: '30 days' },
  { value: '90d' as const, label: '90 days' },
];

export function TypeBadge({ type }: { type: WorkoutType }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TYPE_BADGE[type]}`}>{type}</span>;
}

/** Labels demonstration data; hidden for real accounts, which have none. */
export function DemoBadge({ text = 'Demo data' }: { text?: string }) {
  if (!useHasSampleData()) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
      <FlaskConical size={11} /> {text}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide = false, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  // Rendered on <body> so a parent with blur or sticky positioning (like the header) can't trap it.
  return createPortal(
    // Centred on phones too, clear of the notch and home bar.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className={`relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col rounded-2xl bg-white shadow-xl sm:max-h-[92vh] ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {text && <p className="mt-1 text-xs text-slate-500">{text}</p>}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dashed ? (
            <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }: {
  active?: boolean;
  payload?: { name: string; value: number | string; color?: string; stroke?: string; fill?: string; dataKey?: string }[];
  label?: string | number;
  labelFormatter?: (l: string | number) => string;
  valueFormatter?: (v: number | string, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <p className="mb-1 font-medium text-slate-900">{labelFormatter ? labelFormatter(label) : label}</p>}
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <p key={`${p.name}-${p.dataKey}`} className="flex items-center gap-2 text-slate-600">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.stroke ?? p.fill }} />
            <span>{p.name}</span>
            <span className="ml-auto pl-3 font-medium text-slate-900">{valueFormatter ? valueFormatter(p.value, p.name) : p.value}</span>
          </p>
        ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-slate-500 sm:text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MiniStat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-slate-900">{value}</p>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
