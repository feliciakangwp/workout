import { useCallback, useEffect, useState } from 'react';
import { Layout, NAV, type PageId } from './components/Layout';
import { AddWorkoutModal } from './components/AddWorkoutModal';
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
  const [adding, setAdding] = useState(false);

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

  const openAdd = useCallback(() => setAdding(true), []);

  return (
    <DataProvider>
      <Layout page={page} onNavigate={navigate} onAddWorkout={openAdd}>
        {page === 'overview' && <Overview onNavigate={navigate} />}
        {page === 'muscles' && <MuscleAnalysis />}
        {page === 'strength' && <StrengthProgression />}
        {page === 'running' && <RunningPerformance />}
        {page === 'hyrox' && <HyroxPerformance />}
        {page === 'recovery' && <Recovery />}
        {page === 'log' && <WorkoutLog onAddWorkout={openAdd} />}
      </Layout>
      <AddWorkoutModal open={adding} onClose={() => setAdding(false)} />
    </DataProvider>
  );
}
