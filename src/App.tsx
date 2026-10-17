import { CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout, NAV, type PageId } from './components/Layout';
import { AddWorkoutModal } from './components/AddWorkoutModal';
import { AthleteProfileModal } from './components/AthleteProfileModal';
import { UIProvider } from './context/UIContext';
import { DataProvider } from './context/DataContext';
import { Overview } from './pages/Overview';
import { MuscleAnalysis } from './pages/MuscleAnalysis';
import { StrengthProgression } from './pages/StrengthProgression';
import { RunningPerformance } from './pages/RunningPerformance';
import { HyroxPerformance } from './pages/HyroxPerformance';
import { Recovery } from './pages/Recovery';
import { WorkoutLog } from './pages/WorkoutLog';

const readHash = (): PageId => {
  const id = window.location.hash.replace('#/', '') as PageId;
  return NAV.some((n) => n.id === id) ? id : 'overview';
};

export default function App() {
  const [page, setPage] = useState<PageId>(readHash);
  /** null = closed; otherwise the open workout being continued (or a blank form). */
  const [adding, setAdding] = useState<{ draftId?: string; key: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setPage(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((p: PageId) => {
    window.location.hash = `/${p}`;
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);

  const openAdd = useCallback((draftId?: string) => setAdding({ draftId, key: Date.now() }), []);
  const ui = useMemo(() => ({ openAddWorkout: openAdd, openProfile: () => setProfileOpen(true), notify: setToast }), [openAdd]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <DataProvider>
      <UIProvider value={ui}>
        <Layout page={page} onNavigate={navigate}>
          {page === 'overview' && <Overview onNavigate={navigate} />}
          {page === 'muscles' && <MuscleAnalysis />}
          {page === 'strength' && <StrengthProgression />}
          {page === 'running' && <RunningPerformance />}
          {page === 'hyrox' && <HyroxPerformance />}
          {page === 'recovery' && <Recovery />}
          {page === 'log' && <WorkoutLog onAddWorkout={() => openAdd()} />}
        </Layout>
        {adding && <AddWorkoutModal key={adding.key} draftId={adding.draftId} onClose={() => setAdding(null)} />}
        <AthleteProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
        {toast && (
          <div className="fixed bottom-24 left-1/2 z-[60] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg lg:bottom-5" role="status">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" /> {toast}
          </div>
        )}
      </UIProvider>
    </DataProvider>
  );
}
