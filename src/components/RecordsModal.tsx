import type { Records } from '../lib/analytics';
import { fmtPace } from '../lib/format';
import { Modal } from './ui';

/** Celebrates the personal records a workout just set. */
export function RecordsModal({ records, onClose }: { records: Records; onClose: () => void }) {
  const items = [
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
      title: 'Heaviest Lift 💪',
      stat: records.heaviest.map((h) => `${h.name} ${h.kg} kg (was ${h.previousKg} kg)`).join(' · '),
      text: 'HULK MODE ACTIVATED! 🦍 You just lifted heavier than ever! Your muscles got the memo. Ready to raise the bar again? 🔥',
    },
  ].filter((x): x is { title: string; stat: string; text: string } => !!x);

  return (
    <Modal
      open
      onClose={onClose}
      title={items.length > 1 ? 'New personal records! 🎉' : items[0].title}
      footer={<button className="btn-primary px-6" onClick={onClose}>Let's go!</button>}
    >
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.title} className="rounded-xl bg-amber-50 p-3">
            {items.length > 1 && <p className="text-sm font-semibold text-amber-900">{it.title}</p>}
            <p className="text-xs font-medium text-amber-800">{it.stat}</p>
            <p className="mt-1.5 text-sm text-slate-700">{it.text}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
