import { Activity, BarChart3, ChevronsLeft, ChevronsRight, Dumbbell, Footprints, HeartPulse, LayoutDashboard, ListChecks, Menu, Plus, Trophy, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { DemoBadge } from './ui';
import { fmtLong } from '../lib/dates';
import { useData } from '../context/DataContext';

export type PageId = 'overview' | 'muscles' | 'strength' | 'running' | 'hyrox' | 'recovery' | 'log';

export const NAV: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'muscles', label: 'Muscle Analysis', icon: Activity },
  { id: 'strength', label: 'Strength Progression', icon: Dumbbell },
  { id: 'running', label: 'Running Performance', icon: Footprints },
  { id: 'hyrox', label: 'HYROX Performance', icon: Trophy },
  { id: 'recovery', label: 'Recovery', icon: HeartPulse },
  { id: 'log', label: 'Workout Log', icon: ListChecks },
];

function NavList({ page, onNavigate, collapsed }: { page: PageId; onNavigate: (p: PageId) => void; collapsed: boolean }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = id === page;
        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            title={collapsed ? label : undefined}
            aria-current={active ? 'page' : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            } ${collapsed ? 'justify-center' : ''}`}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </button>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
        <BarChart3 size={18} />
      </span>
      {!collapsed && (
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">HYROX Performance</p>
          <p className="text-[11px] text-slate-500">Training dashboard</p>
        </div>
      )}
    </div>
  );
}

export function Layout({ page, onNavigate, onAddWorkout, children }: { page: PageId; onNavigate: (p: PageId) => void; onAddWorkout: () => void; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { today, workouts } = useData();
  const added = workouts.filter((w) => !w.isSample).length;
  const go = (p: PageId) => {
    onNavigate(p);
    setMobileOpen(false);
  };

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 transition-[width] duration-200 lg:flex ${collapsed ? 'w-[76px]' : 'w-64'}`}>
        <div className="px-1">
          <Brand collapsed={collapsed} />
        </div>
        <div className="mt-7 flex-1 overflow-y-auto">
          <NavList page={page} onNavigate={go} collapsed={collapsed} />
        </div>
        {!collapsed && (
          <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-800">Demo athlete</p>
            <p className="mt-0.5">Female HYROX athlete · Doubles & Mixed Relay prep</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 ${collapsed ? 'justify-center' : ''}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Collapse</>}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white px-3 py-5 shadow-xl">
            <div className="flex items-center justify-between px-1">
              <Brand collapsed={false} />
              <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <div className="mt-6">
              <NavList page={page} onNavigate={go} collapsed={false} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{NAV.find((n) => n.id === page)?.label}</p>
            <p className="truncate text-xs text-slate-500">Demo date: {fmtLong(today)}</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <DemoBadge text="Prototype · demonstration data" />
            {added > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">{added} added this session</span>}
          </div>
          <button onClick={onAddWorkout} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Add workout</span>
          </button>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
        <footer className="px-6 pb-6 text-center text-[11px] text-slate-400">
          Prototype dashboard. All metrics are generated demonstration data — no device or service is connected.
        </footer>
      </div>
    </div>
  );
}
