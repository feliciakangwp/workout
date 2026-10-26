import type { ReactNode } from 'react';
import type { Records } from '../lib/analytics';
import { fmtPace } from '../lib/format';
import { Modal } from './ui';

interface Item {
  title: string;
  stat: ReactNode;
  text: string;
}

/** Celebrates the personal records a workout just set. */
export function RecordsModal({ records, onClose }: { records: Records; onClose: () => void }) {
  const items = ([
    records.comeback && {
      title: 'Look who’s back from vacation! 😎💪',
      stat: '',
      text: `${records.comeback.restDays} days of rest and you’re back in action! Your muscles thought they were retired. 😂 Nice comeback! See you tomorrow? 🔥`,
    },
    records.longest && {
      title: 'Longest Distance 🏃‍♀️',
      stat: `${records.longest.km} km · previous longest ${records.longest.previousKm} km`,
      text: 'New distance unlocked! 🔥 Your legs went further than ever! Who knew they had it in them? Ready to go even further? 🚀',
    },
    records.fastest && {
      title: 'Fastest Pace ⚡',
      stat: `${fmtPace(records.fastest.paceSecPerKm)}/km over ${records.fastest.km} km · previous best ${fmtPace(records.fastest.previousPace)}/km`,
      text: "Speed demon alert! 💨 You've just outrun your old self! Even your past record couldn't keep up. What's your next speed target? 🚀",
    },
    records.heaviest.length > 0 && {
      title: records.heaviest.length > 1 ? `Heaviest Lift 💪 · ${records.heaviest.length} records` : 'Heaviest Lift 💪',
      // One row per exercise, so several records stay readable.
      stat: (
        <ul className="mt-1 divide-y divide-amber-100 overflow-hidden rounded-lg bg-white/70">
          {records.heaviest.map((h) => (
            <li key={h.name} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{h.name}</span>
              <span className="shrink-0 text-slate-500">was {h.previousKg} kg</span>
              <span className="shrink-0 font-semibold text-amber-900">{h.kg} kg</span>
              <span className="w-14 shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-center font-semibold text-emerald-800">+{Math.round((h.kg - h.previousKg) * 10) / 10} kg</span>
            </li>
          ))}
        </ul>
      ),
      text: 'HULK MODE ACTIVATED! 🦍 You just lifted heavier than ever! Your muscles got the memo. Ready to raise the bar again? 🔥',
    },
  ] as (Item | false | undefined)[]).filter((x): x is Item => !!x);

  return (
    <Modal
      open
      onClose={onClose}
      title={items.length > 1 ? (records.comeback ? 'Welcome back! 🎉' : 'New personal records! 🎉') : items[0].title}
      footer={<button className="btn-primary px-6" onClick={onClose}>Let's go!</button>}
    >
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.title} className="rounded-xl bg-amber-50 p-3">
            {items.length > 1 && <p className="text-sm font-semibold text-amber-900">{it.title}</p>}
            {typeof it.stat === 'string' ? it.stat && <p className="text-xs font-medium text-amber-800">{it.stat}</p> : it.stat}
            <p className="mt-1.5 text-sm text-slate-700">{it.text}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
