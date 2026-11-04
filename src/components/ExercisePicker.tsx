import { ChevronDown, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface PickerOption {
  name: string;
  /** The athlete's own (custom) exercise. */
  mine?: boolean;
}

/**
 * Exercise chooser with a search box: tap to open, type to narrow the list.
 * When nothing matches, offers a custom exercise with the typed name.
 */
export function ExercisePicker({
  id,
  value,
  customValue,
  customName,
  options,
  onPick,
}: {
  id: string;
  /** Chosen exercise name, `customValue` for a custom exercise, or '' for none yet. */
  value: string;
  customValue: string;
  /** Name typed for a custom exercise, shown on the button. */
  customName?: string;
  options: PickerOption[];
  /** `customName` is set when a custom exercise is picked from a search. */
  onPick: (name: string, customName?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close when tapping anywhere else.
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
    };
  }, [open]);

  // Every typed word must appear in the name: "bar sq" finds Barbell Squat.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = options.filter((o) => words.every((w) => o.name.toLowerCase().includes(w)));
  const typed = query.trim();
  const pick = (name: string, customName?: string) => {
    onPick(name, customName);
    setOpen(false);
    setQuery('');
  };
  const pickCustom = () => pick(customValue, typed || undefined);

  return (
    <div ref={ref}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`input flex items-center justify-between gap-2 text-left ${value ? 'text-slate-900' : 'text-slate-400'}`}
      >
        <span className="truncate">{value === customValue ? customName?.trim() || 'Custom exercise' : value || 'Choose an exercise…'}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3">
            <Search size={15} className="shrink-0 text-slate-400" />
            <input
              autoFocus
              type="search"
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              placeholder="Search exercises…"
              aria-label="Search exercises"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (matches[0]) pick(matches[0].name);
                  else pickCustom();
                }
              }}
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto overscroll-contain py-1">
            {matches.map((o) => (
              <li key={o.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.name === value}
                  onClick={() => pick(o.name)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 ${o.name === value ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-800'}`}
                >
                  <span className="truncate">{o.name}</span>
                  {o.mine && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">my exercise</span>}
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Nothing found for “{typed}”.</li>}
          </ul>
          <button type="button" onClick={pickCustom} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-blue-700 hover:bg-blue-50">
            <Plus size={15} className="shrink-0" />
            <span className="truncate">{typed ? `Create custom exercise “${typed}”` : 'Custom exercise…'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
