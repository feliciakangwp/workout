import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 5 * 60 * 1000;

/**
 * Phones often keep showing a cached copy of the app after a deploy. This
 * checks version.json (never cached) when the app opens or comes back into
 * view, and offers a refresh when a newer version is live.
 */
export function UpdateBanner() {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const check = () =>
      fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: { build?: string } | null) => v?.build && v.build !== __BUILD_ID__ && setOutdated(true))
        .catch(() => undefined);
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);
  if (!outdated) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg" role="status">
        <span className="min-w-0 flex-1">A new version of the app is available.</span>
        <button className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold hover:bg-blue-500" onClick={() => window.location.reload()}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
    </div>
  );
}
