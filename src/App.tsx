import { CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ALL_NAV, Layout, type PageId } from './components/Layout';
import { AddWorkoutModal } from './components/AddWorkoutModal';
import { AthleteProfileModal } from './components/AthleteProfileModal';
import { LoginScreen } from './components/LoginScreen';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UIProvider } from './context/UIContext';
import { DataProvider, useData } from './context/DataContext';
import { Overview } from './pages/Overview';
import { MuscleAnalysis } from './pages/MuscleAnalysis';
import { StrengthProgression } from './pages/StrengthProgression';
import { RunningPerformance } from './pages/RunningPerformance';
import { HyroxPerformance } from './pages/HyroxPerformance';
import { Recovery } from './pages/Recovery';
import { WorkoutLog } from './pages/WorkoutLog';
import { Friends } from './pages/Friends';
import { BodyComposition } from './pages/BodyComposition';
import type { WorkoutType } from './data/types';

type PlannedRef = { date: string; type: WorkoutType };

const readHash = (): PageId => {
  const id = window.location.hash.replace('#/', '') as PageId;
  return ALL_NAV.some((n) => n.id === id) ? id : 'overview';
};

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

/** Sign-in first; then the dashboard of the athlete being viewed (yourself or a friend). */
function Gate() {
  const { user, loading, viewing } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  if (!user || !viewing) return <LoginScreen />;
  return (
    <DataProvider key={viewing.id}>
      <Dashboard />
    </DataProvider>
  );
}

function Dashboard() {
  const { readOnly } = useData();
  const [page, setPage] = useState<PageId>(readHash);
  /**
   * null = closed. Otherwise: a blank form, an open workout being continued (draftId),
   * a planned workout's exercises being planned (plan), or a planned workout being started (start).
   */
  const [adding, setAdding] = useState<{ draftId?: string; plan?: PlannedRef; start?: PlannedRef; key: number } | null>(null);
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

  // A friend's dashboard is view-only: nothing opens an editor.
  const openAdd = useCallback((draftId?: string) => !readOnly && setAdding({ draftId, key: Date.now() }), [readOnly]);
  const ui = useMemo(
    () => ({
      openAddWorkout: openAdd,
      openPlanEditor: (date: string, type: WorkoutType) => !readOnly && setAdding({ plan: { date, type }, key: Date.now() }),
      startPlannedWorkout: (date: string, type: WorkoutType) => !readOnly && setAdding({ start: { date, type }, key: Date.now() }),
      openProfile: () => !readOnly && setProfileOpen(true),
      notify: setToast,
    }),
    [openAdd, readOnly],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <UIProvider value={ui}>
      <Layout page={page} onNavigate={navigate}>
        {page === 'overview' && <Overview onNavigate={navigate} />}
        {page === 'muscles' && <MuscleAnalysis />}
        {page === 'strength' && <StrengthProgression />}
        {page === 'running' && <RunningPerformance />}
        {page === 'hyrox' && <HyroxPerformance />}
        {page === 'recovery' && <Recovery />}
        {page === 'log' && <WorkoutLog onAddWorkout={() => openAdd()} />}
        {page === 'body' && <BodyComposition />}
        {page === 'friends' && <Friends onOpenDashboard={() => navigate('overview')} />}
      </Layout>
      {adding && <AddWorkoutModal key={adding.key} draftId={adding.draftId} plan={adding.plan} start={adding.start} onClose={() => setAdding(null)} />}
      <AthleteProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[60] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg lg:bottom-5" role="status">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-400" /> {toast}
        </div>
      )}
    </UIProvider>
  );
}
