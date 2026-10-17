import { Activity, BarChart3, ChevronRight, ChevronsLeft, ChevronsRight, Dumbbell, Footprints, HeartPulse, LayoutDashboard, ListChecks, LogOut, Pencil, Play, Plus, Scale, Trophy, Users, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { DemoBadge } from './ui';
import { fmtLong, fmtShort, diffDays } from '../lib/dates';
import { simLabel } from '../data/stations';
import { DEFAULT_TITLE } from './AddWorkoutModal';
import { planSummary } from './WeeklyPlanner';
import { planKey } from '../data/types';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { raceTypeLabel, upcomingRaces } from '../lib/analytics';

export type PageId = 'overview' | 'muscles' | 'strength' | 'running' | 'hyrox' | 'recovery' | 'log' | 'body' | 'friends';

export const NAV: { id: PageId; label: string; short: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', short: 'Home', icon: LayoutDashboard },
  { id: 'muscles', label: 'Muscle Analysis', short: 'Muscles', icon: Activity },
  { id: 'strength', label: 'Strength Progression', short: 'Strength', icon: Dumbbell },
  { id: 'running', label: 'Running Performance', short: 'Running', icon: Footprints },
  { id: 'hyrox', label: 'HYROX Performance', short: 'HYROX', icon: Trophy },
  { id: 'recovery', label: 'Recovery', short: 'Recovery', icon: HeartPulse },
  { id: 'log', label: 'Workout Log', short: 'Log', icon: ListChecks },
];

/** Pages reached from the sidebar and account menu, but not the mobile tab bar. */
export const EXTRA_NAV: typeof NAV = [
  { id: 'body', label: 'Body Composition', short: 'Body', icon: Scale },
  { id: 'friends', label: 'Friends', short: 'Friends', icon: Users },
];
export const ALL_NAV = [...NAV, ...EXTRA_NAV];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function NavList({ page, onNavigate, collapsed }: { page: PageId; onNavigate: (p: PageId) => void; collapsed: boolean }) {
  return (
    <nav className="flex flex-col gap-1">
      {ALL_NAV.map(({ id, label, icon: Icon }) => {
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

/** Athlete summary with the next race; opens the athlete & race editor. */
function AthleteCard() {
  const { goals, today, athlete, readOnly } = useData();
  const { openProfile } = useUI();
  const next = upcomingRaces(goals, today)[0];
  return (
    <button
      onClick={readOnly ? undefined : openProfile}
      disabled={readOnly}
      className="mb-3 w-full rounded-xl bg-slate-50 p-3 text-left text-xs text-slate-600 ring-1 ring-inset ring-transparent transition enabled:hover:bg-blue-50 enabled:hover:ring-blue-200"
    >
      <span className="flex items-center justify-between">
        <span className="font-medium text-slate-800">{athlete.displayName} · {goals.athleteSex === 'female' ? 'Female' : 'Male'}</span>
        {!readOnly && <ChevronRight size={14} className="text-slate-400" />}
      </span>
      {next ? (
        <span className="mt-1 block">
          Next: <b className="font-medium text-slate-700">{next.name}</b>
          <span className="block">{raceTypeLabel(next, goals.athleteSex)} · {diffDays(next.date, today)} days</span>
        </span>
      ) : (
        <span className="mt-1 block">No upcoming race{readOnly ? '' : ' · tap to add races'}</span>
      )}
    </button>
  );
}

/** Today's planned workouts that haven't been started or logged yet. */
function TodayPlanBar() {
  const { plan, planDetails, today, workouts, drafts, readOnly } = useData();
  const { startPlannedWorkout } = useUI();
  if (readOnly) return null;
  const pending = (plan[today] ?? []).filter((t) => !workouts.some((w) => w.date === today && w.type === t) && !drafts.some((d) => d.fromPlan === planKey(today, t)));
  if (!pending.length) return null;
  return (
    <div className="mb-3 space-y-2">
      {pending.map((t) => {
        const detail = planDetails[planKey(today, t)];
        return (
          <div key={t} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 sm:px-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Play size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Today's plan</span>
              <span className="block truncate text-sm font-medium text-slate-900">
                {t}
                <span className="font-normal text-slate-500"> · {detail ? planSummary(detail) + ' planned' : 'no exercises planned'}</span>
              </span>
            </span>
            <button onClick={() => startPlannedWorkout(today, t)} className="btn-primary h-9 shrink-0 bg-emerald-600 px-3 text-xs hover:bg-emerald-700">
              Start workout
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Workouts saved with "Save" but not yet marked Completed. */
function OpenWorkoutsBar() {
  const { drafts, deleteDraft } = useData();
  const { openAddWorkout } = useUI();
  if (!drafts.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {drafts.map((d) => {
        const f = d.form;
        const title = f.type === 'HYROX' ? `HYROX ${simLabel(f.sim)}` : f.title.trim() || DEFAULT_TITLE[f.type];
        return (
          <div key={d.id} className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 sm:px-4">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-600" />
            </span>
            <button onClick={() => openAddWorkout(d.id)} className="min-w-0 flex-1 text-left">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-700">Open workout</span>
              <span className="block truncate text-sm font-medium text-slate-900">
                {title} · {fmtShort(f.date)}
                <span className="font-normal text-slate-500"> · saved {new Date(d.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </span>
            </button>
            <button onClick={() => openAddWorkout(d.id)} className="btn-primary h-9 shrink-0 px-3 text-xs">
              Continue
            </button>
            <button
              onClick={() => window.confirm(`Discard the open workout "${title}"?`) && deleteDraft(d.id)}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-600"
              aria-label={`Discard ${title}`}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Avatar button with the account menu: races, friends, sign out. */
function AccountMenu({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const { user, signOut, backend, viewFriend } = useAuth();
  const { readOnly } = useData();
  const { openProfile } = useUI();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!user) return null;
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100';
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 hover:bg-blue-200" aria-label="Account menu" aria-expanded={open}>
        {initials(user.profile.displayName)}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">{user.profile.displayName}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            {backend.mode === 'demo' && <p className="mt-1 text-[11px] text-amber-700">Demo account (stored in this browser)</p>}
          </div>
          <div className="my-1 border-t border-slate-100" />
          {readOnly ? (
            <button className={item} onClick={() => { viewFriend(null); setOpen(false); }}><LayoutDashboard size={16} /> Back to my dashboard</button>
          ) : (
            <button className={item} onClick={() => { openProfile(); setOpen(false); }}><Pencil size={16} /> Athlete & races</button>
          )}
          <button className={item} onClick={() => { onNavigate('body'); setOpen(false); }}><Scale size={16} /> Body composition</button>
          <button className={item} onClick={() => { onNavigate('friends'); setOpen(false); }}><Users size={16} /> Friends</button>
          <button className={`${item} text-rose-600 hover:bg-rose-50`} onClick={() => signOut()}><LogOut size={16} /> Sign out</button>
        </div>
      )}
    </div>
  );
}

/** Shown while looking at a friend's dashboard. */
function ViewingBanner() {
  const { athlete, readOnly } = useData();
  const { viewFriend } = useAuth();
  if (!readOnly) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-200 text-xs font-semibold text-violet-800">{initials(athlete.displayName)}</span>
      <p className="min-w-0 flex-1 text-sm text-violet-900">
        Viewing <b className="font-semibold">{athlete.displayName}</b>'s dashboard · <span className="text-violet-700">view only</span>
      </p>
      <button className="btn-ghost text-xs" onClick={() => viewFriend(null)}>Back to my dashboard</button>
    </div>
  );
}

export function Layout({ page, onNavigate, children }: { page: PageId; onNavigate: (p: PageId) => void; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { today, workouts, readOnly } = useData();
  const { openAddWorkout } = useUI();
  const added = workouts.filter((w) => !w.isSample).length;

  return (
    <div className="flex min-h-screen">
      {/* Desktop / laptop sidebar */}
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 transition-[width] duration-200 lg:flex ${collapsed ? 'w-[76px]' : 'w-60 xl:w-64'}`}>
        <div className="px-1">
          <Brand collapsed={collapsed} />
        </div>
        <div className="mt-7 flex-1 overflow-y-auto">
          <NavList page={page} onNavigate={onNavigate} collapsed={collapsed} />
        </div>
        {!collapsed && <AthleteCard />}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 ${collapsed ? 'justify-center' : ''}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Collapse</>}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur sm:px-6 sm:py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white lg:hidden">
            <BarChart3 size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 lg:font-medium">{ALL_NAV.find((n) => n.id === page)?.label}</p>
            <p className="truncate text-[11px] text-slate-500 sm:text-xs">Demo date: {fmtLong(today)}</p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <DemoBadge text="Prototype · demonstration data" />
            {added > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">{added} logged</span>}
          </div>
          {!readOnly && (
            <button onClick={() => openAddWorkout()} className="btn-primary h-9 px-3 sm:px-3.5" aria-label="Add workout">
              <Plus size={18} /> <span className="hidden sm:inline">Add workout</span>
            </button>
          )}
          <AccountMenu onNavigate={onNavigate} />
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 pb-28 pt-4 sm:px-6 sm:py-6 lg:pb-6">
          {page !== 'friends' && <ViewingBanner />}
          <TodayPlanBar />
          <OpenWorkoutsBar />
          {children}
        </main>
        <footer className="hidden px-6 pb-6 text-center text-[11px] text-slate-400 lg:block">
          Prototype dashboard. All metrics are generated demonstration data — no device or service is connected.
        </footer>
      </div>

      {/* Mobile / tablet bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Sections">
        <div className="mx-auto flex max-w-2xl">
          {NAV.map(({ id, short, icon: Icon }) => {
            const active = id === page;
            return (
              <button key={id} onClick={() => onNavigate(id)} aria-current={active ? 'page' : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 pb-2 pt-2 text-[10px] font-medium ${active ? 'text-blue-600' : 'text-slate-500'}`}>
                <span className={`flex h-7 w-10 items-center justify-center rounded-full ${active ? 'bg-blue-50' : ''}`}>
                  <Icon size={19} />
                </span>
                <span className="w-full truncate text-center">{short}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
