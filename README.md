# HYROX Training & Performance Dashboard (prototype)

Phase-1 frontend prototype of a training analytics dashboard for a female HYROX athlete preparing for Women's Doubles and Mixed Relay.
All numbers are **demonstration data** — nothing is connected to Garmin or any other service.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm run build` (typecheck + production build), `npm run preview`, `npm run typecheck`.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · Recharts · Lucide React

## Structure

```
src/
  data/            central demo data and reference tables
    mockData.ts    seeded 13-week workout + wellness generator, goals, weekly schedule
    exercises.ts   exercise → muscle mapping (primary / secondary / conditioning)
    muscles.ts     muscle groups and weekly set targets
    stations.ts    HYROX stations, standard work and example target times
  lib/analytics/   pure functions deriving every metric from the workout list
  context/         DataContext: sample + session-added workouts, editable goals
  components/      layout, UI primitives, body map, workout detail, add-workout form
  pages/           Overview, Muscle Analysis, Strength, Running, HYROX, Recovery, Workout Log
```

### Races and HYROX simulations

- **Athlete & races** (sidebar card on laptop, profile icon on mobile): choose the athlete's sex and upcoming races —
  Solo, Doubles (stations shared, every run done yourself) or Relay (1 km run + only your chosen stations, open weights),
  each with Open or Pro weights. The HYROX page shows each race's segments and the muscle groups to focus on.
- **Add workout → HYROX** records race-style splits: Half, ¾ or Full Sim, a 1 km run before every station, and station
  distances / reps scaled to the sim. Half and ¾ station times are scaled to full distance for comparison.

Every chart is computed from the same workout list, so workouts added through **Add workout** immediately update
all pages (muscle coverage, strength progression, running, HYROX stations, training load and soreness).
Added workouts live in React state only and reset on reload.

The prototype uses a fixed demo date (`DEMO_TODAY = 2026-10-17`) so the sample data always lines up with the calendar.
