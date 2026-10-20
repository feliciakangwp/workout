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
    mockData.ts    seeded 13-week workout generator, goals, weekly schedule
    exercises.ts   exercise → muscle mapping (primary / secondary / conditioning)
    muscles.ts     muscle groups and weekly set targets
    stations.ts    HYROX stations, standard work and example target times
  lib/analytics/   pure functions deriving every metric from the workout list
  context/         DataContext: sample + session-added workouts, editable goals
  components/      layout, UI primitives, body map, workout detail, add-workout form
  pages/           Overview, Muscle Analysis, Strength, Running, HYROX, Workout Log, Body Composition, Friends
```

### Accounts and friends

**Sign up** takes a user ID and a password; the profile is named after the user ID and starts empty, ready for the
athlete's races, workouts, sets and reps. The user ID must be unique (ignoring case): the form says straight away
whether it is available. Athletes sign in with user ID + password, and change their user ID by tapping their name in
the account menu.

Each athlete signs in and sees only their own dashboard. Friends (after a request is accepted) can open each other's
dashboards **read-only** from the Friends page (account menu → Friends).

- **Teammates**: in a Doubles or Relay race you can tag friends (1 partner / up to 3 relay teammates). The race then
  appears in their races too and any teammate can edit it; each relay member picks their own legs. Only the person who
  created the race changes who is tagged; a tagged teammate can leave the race.
- **Demo mode** (default): accounts live in this browser only. Demo athletes with sample data (no password):
  Felicia, Fiona and Jordan (Jordan has sent Felicia a friend request). Data is kept in browser storage between visits.
- **Supabase mode**: user ID + password sign-in, with data stored in Supabase. Enabled when
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set at build time.

#### Connecting Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). It creates `profiles`, `friendships` and
   `user_data` (plus `shared_races` for tagged teammates) with row-level security: only you can change your data; only
   accepted friends can read it. User IDs are unique ignoring case; search matches user IDs.
3. In **Authentication → Sign In / Providers → Email**, keep Email enabled and turn **off "Confirm email"**. Supabase
   Auth needs an email per account, so the app gives each one a hidden login address
   (`<random>@users.hyrox-dashboard.app`) that is never shown or emailed; friends only ever see their user ID.
   In **Authentication → URL Configuration**, set the Site URL to `https://<user>.github.io/workout/`.
4. From **Project Settings → API**, copy the Project URL and the `anon` public key.
5. In GitHub: **Settings → Secrets and variables → Actions → Variables**, add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`, then re-run the *Deploy to GitHub Pages* workflow.
   For local development put the same two values in a `.env.local` file.
6. Optional, for AI reading of body composition scans: install the [Supabase CLI](https://supabase.com/docs/guides/cli),
   then run `supabase functions deploy read-body-scan` and
   `supabase secrets set ANTHROPIC_API_KEY=<your key>`. The function
   ([`supabase/functions/read-body-scan`](supabase/functions/read-body-scan/index.ts)) sends the photo to Claude and
   returns the values. Without it (and in demo mode) scans are read on-device with Tesseract OCR, which works best on
   clear, straight-on screenshots.

### Race 3D

**Race 3D** (sidebar or account menu) draws the race floor with Three.js: start / finish, the eight stations in order
and a 1 km run lane before each. Each station has a solid pillar for your best time and a glass one for your average,
with its base coloured by the gap between them (green small, amber, red large); labels give the times. The panel on top
shows the estimated finish range. *Solo* uses your own sims and races; *Doubles* uses the team estimate with the partner
tagged in your upcoming doubles race. *Play the race* replays it with a runner and a race clock at best or average pace.
Three.js is only downloaded when the tab is opened.

### Body composition

**Body Composition** (sidebar, account menu, or *Body composition →* on the Overview goals card): *Add weigh-in*,
upload a photo of an InBody-style scan and tap *Read values from photo*. Weight, skeletal muscle, fat mass, body fat %
and the **segmental lean and fat** (kg, % and Under / Normal / Over for each arm, trunk and leg) are filled in for you
to check and correct before saving. Each new weigh-in is compared with the previous one (or any earlier one): what
went up or down overall and per body part, whether fat was lost while keeping muscle, and left / right imbalance.
The latest weigh-in sets the current body weight on the goals card. Two invented example weigh-ins are shown until
you add your own.

### Races and HYROX simulations

- **Athlete & races** (sidebar card on laptop, profile icon on mobile): choose the athlete's sex and upcoming races —
  Solo, Doubles (stations shared, every run done yourself) or Relay (1 km run + only your chosen stations, open weights),
  each with Open or Pro weights. The HYROX page shows each race's segments and the muscle groups to focus on.
- **Completed races**: races move under *Completed* once their date passes. Enter the finish time, or fill the optional
  run / station splits plus the Roxzone time to calculate it automatically. The HYROX page compares each race with the
  previous one (what improved, what slowed, per-segment changes).
- **Muscle focus**: solo and doubles races focus every muscle group; while all upcoming races are relays, their primary
  muscle groups are shown in bold on Muscle Analysis.
- **Weekly training plan** (Overview): starts empty; plan F45, HYROX, HYROX Engine, Recovery, Running or Strength for
  today and future days. Past days are view-only. Swipe right for earlier weeks, left for later ones.
- **Plan ahead**: on a planned day, *Plan exercises* fills in the workout (exercises, sets, reps, target weights, runs)
  and *Save plan* keeps it. On the day, a *Today's plan → Start workout* bar opens the workout pre-filled from the plan.
  *+ Add workout* is for unplanned (ad-hoc) sessions.
- **Open workouts**: *Save* keeps a workout open (shown in a bar at the top of every page) so you can keep logging;
  only *Completed* adds it to the workout log and charts.
- **Exercise logging**: lifts use sets × reps × weight, with your best previous effort shown in grey. Plank is logged
  by time; SkiErg, Row Erg, Assault Bike and Bike Erg by distance and time (not offered in Strength sessions).
- **Runs**: Running and HYROX Engine sessions take any number of runs / intervals (*+ Add run*). In HYROX Engine, runs
  and exercises sit in one list in the order you do them; the arrows move a run before, after or between exercises. On the Running page,
  pure runs are *Running* and runs inside HYROX / HYROX Engine sessions are *Hyrox Run*.
- **Sim analysis** (HYROX page, and in each sim's details): every run and station of a completed sim is compared with
  your best from any other sim, solo race or relay leg, with new bests flagged. Half and ¾ sims are scaled to a full
  sim (station time ÷ distance share, plus a fatigue allowance of +4% / +2% on stations and +2% / +1% on runs) and
  compared with your best full effort (runs + stations, Roxzone excluded).
- **Race time estimate** (HYROX page): for upcoming solo and doubles races, a finish-time range from the best to the
  average of every run, station and Roxzone across your sims and races (Pro / Open weights matched when possible).
  Doubles use your doubles race splits when you have them, otherwise solo station times × 0.55.
  With a friend tagged as your doubles partner, the range is the team average: the average of both partners' best
  times to the average of both partners' average times (each partner's breakdown is shown too).
- **Add workout → HYROX** records race-style splits: Half, ¾ or Full Sim, a 1 km run before every station, and station
  distances / reps scaled to the sim. Half and ¾ station times are scaled to full distance for comparison.

Every chart is computed from the same workout list, so workouts added through **Add workout** immediately update
all pages (muscle coverage, strength progression, running, HYROX stations and insights).

"Today" is the device's date. The generated sample workouts run from 20 Jul to 17 Oct 2026.
