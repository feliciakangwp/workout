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
  pages/           Overview, Muscle Analysis, Strength, Running, Race, Workout Log, Body Composition, Friends
```

### Accounts and friends

**Sign up** takes a user ID and a password; the profile is named after the user ID and starts empty, ready for the
athlete's races, workouts, sets and reps. The user ID must be unique (ignoring case): the form says straight away
whether it is available. Athletes sign in with user ID + password, and change their user ID by tapping their name in
the account menu.

Each athlete signs in and sees only their own dashboard. Friends (after a request is accepted) can open each other's
dashboards **read-only** from the Friends page (account menu → Friends). Body weight, weight goals and weigh-ins (Body
Composition) are private: they are kept apart (`user_private` in Supabase, readable only by the athlete) and never
shown on, or sent to, a friend's dashboard.

- **Teammates**: in a Doubles or Relay race you can tag friends (1 partner / up to 3 relay teammates). The race then
  appears in their races too and any teammate can edit it. In a relay, *Relay legs* assigns each station to you, a
  tagged teammate or an "Other teammate" not on the app; each friend sees their own legs in their race plan. A
  completed relay takes the whole team's run and station splits; only your own legs count towards your station bests. Only the person who
  created the race changes who is tagged; a tagged teammate can leave the race.
- **Demo mode** (default): accounts live in this browser only. Demo athletes with sample data (no password):
  Felicia, Fiona and Jordan (Jordan has sent Felicia a friend request). Data is kept in browser storage between visits.
- **Explore the demo**: the sign-in page always offers the demo athletes, so anyone can look around without signing up.
  With Supabase connected, the demo stays in that browser and a banner leads back to sign up.
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

**Race 3D** (sidebar or account menu) draws a HYROX arena with Three.js: an oval running track around the outside
(with the Roxzone gate on the front straight) and the eight stations inside, each with an athlete doing the movement
(SkiErg pulls, sled push and pull, burpee broad jumps, rowing, farmer's carry, sandbag lunges, wall ball throws).
Labels give best and average times per station and per run; each station's edge is coloured by the gap between them
(green small, amber, red large). The panel on top shows the estimated finish range. *Solo* uses your own sims and races;
*Doubles* uses the team estimate with the partner tagged in your upcoming doubles race. *Play the race* replays it:
an orange runner laps the track for each 1 km run, then that station's athlete turns orange while the race clock runs.
Three.js is only downloaded when the tab is opened.

### Body composition

**Body Composition** (sidebar, account menu, or *Body composition →* on the Overview goals card): *Add weigh-in*,
upload a photo of an InBody-style scan and tap *Read values from photo*. Weight, skeletal muscle, fat mass, body fat %
and the **segmental lean and fat** (kg, % and Under / Normal / Over for each arm, trunk and leg) are filled in for you
to check and correct before saving. Each new weigh-in is compared with the previous one (or any earlier one): what
went up or down overall and per body part, whether fat was lost while keeping muscle, and left / right imbalance.
The latest weigh-in sets the current body weight on the goals card. Two invented example weigh-ins are shown until
you add your own.

### Saving across devices

Each save checks whether another device (or tab) saved in between and merges the two, so a race or workout added on
the phone isn't overwritten by an older copy open on the laptop. Open apps pick up changes from other devices when
they come back into view and every minute. If sharing a tagged race fails, the race stays in your own races.

### Races and HYROX simulations

- **Athlete & races** (sidebar card on laptop, profile icon on mobile): choose the athlete's sex and upcoming races —
  Solo, Doubles (stations shared, every run done yourself) or Relay (1 km run + only your chosen stations, open weights),
  each with Open or Pro weights. The Race page (formerly HYROX) shows each race's segments and the muscle groups to focus on.
- **Race types**: *Add race* offers HYROX, Redline, Marathon and Other.
  - HYROX: the 8 stations, formats and weights above.
  - Redline: Singles (Level 1–3), Doubles or Team relay in the Women's, Men's or Mixed category (no Mixed singles), with
    the work for all 12 stations (`src/data/redline.ts`). Women's values follow the Redline guide; doubles use the
    Level 3 work and relays the Level 2 work. **Men's and mixed loads are estimates** (marked in the app) until the
    official numbers are added.
  - Marathon: any running race. Pick 5K, 10K, half or full marathon, or type a distance in km. The finish-time
    estimate uses Riegel's formula (time × (distance ratio)^1.06), from your best run of 3 km or more (fast end) to
    your recent average pace (typical end).
  - Other: name, date and finish time only.
  Non-HYROX races take a finish time when completed and are compared with your previous race of the same type
  (and the same distance for running races). HYROX-only features (sim analysis, Race 3D, muscle focus) use HYROX races only.
- **Completed races**: races move under *Completed* once their date passes. Enter the finish time, or fill the optional
  run / station splits plus the Roxzone time to calculate it automatically. The Race page compares each race with the
  previous one (what improved, what slowed, per-segment changes).
- **Muscle focus**: solo and doubles races focus every muscle group; while all upcoming races are relays, their primary
  muscle groups are shown in bold on Muscle Analysis.
- **Weekly training plan** (Overview): starts empty; plan F45, HYROX, HYROX Engine, Recovery, Running or Strength on
  any day. Past days stay editable: *Add a past workout* (or *Log this workout* for a planned one) fills in training you
  did earlier, and logged workouts can be deleted from the day. Go back up to a year: swipe right for earlier weeks,
  left for later ones. Add workout also accepts any past date.
- **Planned = done**: a workout planned for an earlier day counts as done even if it wasn't logged (using
  any exercises written into the plan; *Log this workout* adds the details). Today's plan counts once you tap
  Completed (or from tomorrow if it wasn't logged). A planned Recovery day is a rest day
  unless exercises were planned for it.
- **Plan ahead**: on a planned day, *Plan exercises* fills in the workout (exercises, sets, reps, target weights, runs)
  and *Save plan* keeps it. On the day, a *Today's plan → Start workout* bar opens the workout pre-filled from the plan.
  *+ Add workout* is for unplanned (ad-hoc) sessions.
- **Open workouts**: *Save* keeps a workout open (shown in a bar at the top of every page) so you can keep logging;
  only *Completed* adds it to the workout log and charts.
- **F45 without exercises**: an F45 class completed (or planned and past) with no exercises counts as a full-body
  functional workout: 9 typical moves covering every muscle group at 80% of your best weight for each (a typical
  starting weight if never logged), 45 minutes unless you set the duration.
- **Exercise logging**: lifts use sets × reps × weight, with your best previous effort shown in grey. Plank is logged
  by time; SkiErg, Row Erg, Assault Bike and Bike Erg by distance and time (not offered in Strength sessions).
- **HYROX Engine exercises** are counted by *Reps* (reps × weight), *Distance* (metres, with optional time and weight)
  or *Time* (time per set, optional weight). New exercises start at 1 set. Leave the duration empty to use the
  estimate: timed exercises (sets × time) plus runs; reps-based work and rest aren't timed.
- **Time inputs** everywhere take m:ss or h:mm:ss; a dot works like a colon (5.30 = 5:30) and a plain number is
  minutes (5 = 5:00).
- **Body weight goal** (Overview → Goals & races → Edit): empty until the athlete enters a current and target weight.
  With weigh-ins (Body composition), the current weight comes from the latest one. Progress counts from the weight
  when the target was set. Private: never shown to friends.
- **Personal records**: completing a workout checks it against everything logged before — longest run, fastest
  pace (runs of 1 km+) and, in Strength workouts, the heaviest weight per exercise — and celebrates any new record.
  Walks, planned-only days and a first-ever run or lift don't count.
- **Comeback**: logging today's workout after 2 or more full days without one shows "Look who's back from
  vacation!" with the number of rest days.
- **Goal prompts**: after sign-in, athletes without a weight or running goal see "No goal? No glory!" once per visit;
  *ONZ* opens the goals editor. When a run logged yesterday meets the running goal (distance at or under the target
  pace), or the weight reaches its target, "Goal crushed!" asks for the next goal (once per goal).
- **Running goal** (Overview → Goals & races → Edit): empty until the athlete sets one. Pick 1K, 5K, 10K, half or
  marathon, or type any distance from 1 to 42.2 km, plus an optional target pace. The estimate for that distance uses
  Riegel's formula from the athlete's best standalone run (3 km or more, or 1 km+ for shorter goals).
- **Edit a logged workout**: open it from the Workout Log or a calendar day and tap *Edit workout* to fix the
  duration, add a forgotten set or exercise, or correct runs and sim splits; *Save changes* updates it in place.
- **Walking**: a Running run type for outdoor or treadmill walks. It counts as a workout (time, training load) but
  never as running: no pace, distance, bests, estimates or goal checks use it.
- **Runs**: Running and HYROX Engine sessions take any number of runs / intervals (*+ Add run*). In HYROX Engine, runs
  and exercises sit in one list in the order you do them; the arrows move a run before, after or between exercises. On the Running page,
  pure runs are *Running* and runs inside HYROX / HYROX Engine sessions are *Hyrox Run*.
- **Sim analysis** (HYROX page, and in each sim's details): every run and station of a completed sim is compared with
  your best from any other sim, solo race or relay leg, with new bests flagged. Half and ¾ sims are scaled to a full
  sim (station time ÷ distance share, plus a fatigue allowance of +4% / +2% on stations and +2% / +1% on runs) and
  compared with your best full effort (runs + stations, Roxzone excluded).
- **Race time estimate** (Race page): for upcoming running races (see above) and HYROX solo and doubles races, a finish-time range from the best to the
  average of every run, station and Roxzone across your sims and races (Pro / Open weights matched when possible).
  Doubles use your doubles race splits when you have them, otherwise solo station times × 0.55.
  With a friend tagged as your doubles partner, the range is the team average: the average of both partners' best
  times to the average of both partners' average times (each partner's breakdown is shown too).
- **Add workout → HYROX** records race-style splits: Half, ¾ or Full Sim, a 1 km run before every station, and station
  distances / reps scaled to the sim. Half and ¾ station times are scaled to full distance for comparison.

Every chart is computed from the same workout list, so workouts added through **Add workout** immediately update
all pages (muscle coverage, strength progression, running, HYROX stations and insights).

"Today" is the device's date. The generated sample workouts run from 20 Jul to 17 Oct 2026.
