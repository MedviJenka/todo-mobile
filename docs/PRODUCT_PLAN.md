# Voice To-Do: product & implementation plan

> Status: **draft for review** · Written 2026-11-22 · Expo SDK 58 · Working name "Voice To-Do"
>
> Decisions marked **[default]** are my recommendations. Section 14 lists the ones I need you to confirm.

---

## 1. Summary

You tap the mic and talk through what you need to do. The app turns that into tasks, puts them in order, and books them into free time in Google Calendar. It does this without a review step, and you can undo it.

```
 speak ──► transcript ──► tasks (AI) ──► ordered ──► fitted into free time ──► Google Calendar events
         (OpenAI STT)   (OpenAI LLM)    (code)        (code, on device)          (+ synced task list)
```

The main design rule: **the AI only reads and understands what you said. Plain TypeScript handles all time math** (ordering, finding free slots, avoiding conflicts). Language models make mistakes with "is 14:00–17:00 free?" arithmetic. A small pure function doesn't, and it can be unit-tested.

## 2. Goals & non-goals

**MVP goals**
- One-tap voice capture that handles a messy "brain dump" with several tasks, relative dates ("tomorrow", "by Friday") and self-corrections ("no wait, Thursday").
- Automatic priority + ordering, and automatic booking into free calendar time without double-booking.
- Each task becomes a real Google Calendar event with a reminder, so Google Calendar's own notifications act as the reminder system.
- A plain task list (today / upcoming / unscheduled / done), with complete, edit and delete.
- About 5 seconds from "stop talking" to "it's in my calendar".

**Non-goals for the MVP** (candidates for later, see §12 Phase 3)
- Editing existing tasks by voice ("move gym to 7"). The MVP only adds tasks.
- Recurring tasks ("every Monday").
- Busy time from calendars other than your primary one.
- Splitting long tasks into several blocks.
- Web app, offline/on-device transcription, sharing or teams.

## 3. User experience

### 3.1 Core flow
1. **Tap mic.** Haptic tick, timer, live level meter. Max 3 minutes.
2. **Tap again to stop.** Status shows *Transcribing… → Planning…*
3. **Result sheet.** "Scheduled 3 tasks, 1 added to your list." Each row shows the slot it got and why (e.g. "due Fri", "high priority"). There's an **Undo** button (about 10 s) that deletes the created events and tasks.
4. The task list updates. The events are in Google Calendar under a **"Voice To-Do"** calendar with its own colour.

### 3.2 Worked example (illustrative)
Said on **Monday 23 Nov, 08:40**. Your primary calendar already has meetings 09:00–12:00. Active hours are 09:00–20:00 and the buffer is 10 min.

> "Tomorrow I've got the dentist at 10. I need to finish the quarterly report by Friday, it'll take about three hours. Call mom sometime this week. Oh, and buy milk."

| Extracted task | Priority | Duration | Timing | Result |
|---|---|---|---|---|
| Dentist | high | 60 min | fixed: Tue 24 Nov 10:00 | **Tue 10:00–11:00** (fixed) |
| Finish quarterly report | high | 180 min | by Fri 27 Nov | **Mon 12:15–15:15** (first 3 h gap after meetings) |
| Call mom | medium | 15 min | by Sun 29 Nov | **Mon 15:30–15:45** |
| Buy milk | low | 15 min | none | **List only** (no calendar block) |

### 3.3 Behaviour rules
- **Auto-schedule by default [default].** There's no confirm screen. Undo and per-task edit act as the safety net. A "Review before scheduling" toggle can come in Phase 2 if needed.
- **What gets a calendar block:** anything with a stated time, a deadline, or ≥15 min of focused effort. Quick errands and shopping items stay on the list (`scheduleToCalendar: false`). This keeps the idea from your current `ai-schema.ts`.
- **If a task can't fit before its deadline,** it stays *unscheduled* with a clear reason ("No 3 h gap before Fri"). The app never quietly books it late.
- **Typing instead of speaking** goes through the same pipeline (Phase 2).

### 3.4 Screens (Expo Router, `src/app/`)
| Route | Purpose |
|---|---|
| `sign-in.tsx` | Sign in with Google |
| `connect-calendar.tsx` | Grant calendar access, create the "Voice To-Do" calendar |
| `(app)/index.tsx` | Task list + big mic button |
| `(app)/settings.tsx` | Active hours, buffer, reminder, account, delete data |
| `task/[id].tsx` | Edit sheet (`formSheet` presentation) |

## 4. Architecture

```
┌───────────────────────────── Phone · Expo SDK 58 app ─────────────────────────────┐
│  expo-audio recorder ──► m4a                                                       │
│  Scheduler (pure TS) ◄── busy intervals                                            │
│  Google Calendar client (access token from the google-token Edge Function)        │
│  Task list (supabase-js, RLS)                                                      │
└───────┬───────────────────────────────┬──────────────────────────┬────────────────┘
        │ ① audio  ② transcript+context │ ⑥ task rows              │ ④ freeBusy  ⑥ events
        ▼                               ▼                          ▼
┌───────────────────────────┐   ┌────────────────────┐   ┌──────────────────────────┐
│ Supabase Edge Functions   │   │ Supabase Postgres  │   │ Google Calendar API v3   │
│  transcribe               │   │  tasks, captures,  │   │  primary  (busy only)    │
│  extract-tasks            │   │  user_settings     │   │  "Voice To-Do" (events)  │
│  (holds OPENAI_API_KEY)   │   │  + RLS             │   └──────────────────────────┘
└─────────────┬─────────────┘   └────────────────────┘
              ▼
           OpenAI  (gpt-transcribe · extraction model)
```

**Core loop sequence**
1. Record m4a (mono AAC, ≤3 min).
2. `POST /functions/v1/transcribe` (multipart) → `{ captureId, transcript }`.
3. `POST /functions/v1/extract-tasks` with transcript, `now`, `timeZone`, settings → `{ tasks[], unparsed[] }`.
4. **At the same time as step 3:** the device calls Google `freeBusy` for the planning horizon.
5. On device: `planSchedule(tasks, busy, settings, now)` → placements.
6. Insert task rows (Supabase), create events (Google), then save the event IDs back onto the rows.
7. Show the result sheet with Undo.

### 4.1 Key decisions

| # | Decision | Why |
|---|---|---|
| D1 | **The AI extracts, code schedules** | Deterministic and testable, with no LLM time arithmetic. The LLM only outputs priority, duration estimate and timing hints. |
| D2 | **Scheduler and Calendar calls run on the device** | Calendar data never reaches our server or OpenAI, which keeps Google's user-data policy review simple. It also means no Google refresh tokens to store server-side. |
| D3 | **Dedicated "Voice To-Do" calendar** via `calendar.app.created` + `calendar.freebusy` scopes **[default]** | Least privilege: the app can't read details of, edit or delete any of your existing events. Undo and "delete all data" are clean (delete the calendar). Events still show in your normal calendar view. |
| D4 | **Two steps: speech-to-text, then extraction** | You can see and fix the transcript and re-run extraction without uploading audio again. Typed input reuses step 2. |
| D5 | **OpenAI key lives only in Supabase Edge Function secrets** | Anything bundled into the app is readable by anyone who has it. The functions also give auth, rate limits and input caps for free. |
| D6 | **Google sign-in: `react-native-nitro-google-signin`** **[default]** | MIT-licensed. It uses Android **Credential Manager** (Google's current API), supports `requestScopes()`, `getTokens()` → `accessToken`, and `nonce`. The alternative, `@react-native-google-signin/google-signin` v17, keeps Credential Manager in its paid tier, and its free tier is built on Google's deprecated legacy Android SDK. All sign-in code sits behind `src/lib/google/auth.ts` so the library can be swapped. |
| D7 | **Supabase for auth + task storage** | Already provisioned. Auth is needed anyway to protect the Edge Functions. The DB keeps tasks and the app-calendar ID across reinstalls and devices. |

## 5. Tech stack (checked against current docs, 2026-11-22)

| Concern | Choice | Notes |
|---|---|---|
| Framework | Expo SDK 58, Expo Router, React 19.3, RN 0.88 | Already set up. **Needs a development build** (the sign-in library is native and doesn't run in Expo Go). |
| Recording | `expo-audio` | `useAudioRecorder`, `requestRecordingPermissionsAsync()`, `setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })`, `record({ forDuration: 180 })`, then `recorder.uri` after `stop()`. `isMeteringEnabled` drives the level meter. |
| Audio format | **Custom preset:** spread `RecordingPresets.HIGH_QUALITY` (m4a/AAC), mono, ~64 kbps (~0.5 MB/min) | ⚠️ **Do not use `LOW_QUALITY`.** On Android it records 3gp/AMR, which OpenAI doesn't accept. |
| Google sign-in + tokens | `react-native-nitro-google-signin` + `react-native-nitro-modules` | Config plugin with `iosUrlScheme`. `GoogleOneTapSignIn.configure / signIn / createAccount / presentExplicitSignIn / requestScopes / getTokens / clearCachedAccessToken` |
| Backend | `@supabase/supabase-js` + `@react-native-async-storage/async-storage` | `signInWithIdToken({ provider: 'google', token, nonce })`. Use an AppState listener to call `startAutoRefresh/stopAutoRefresh`. |
| Edge Functions | Deno, `withSupabase({ auth: 'user' }, …)` from `npm:@supabase/server@1` | Rejects calls without a user JWT, and gives an RLS-scoped client. |
| STT | OpenAI **`gpt-transcribe`** | m4a supported, 25 MB max, $0.0045/min. Can pass `languages: [...]` hints from device locales. `whisper-1` and `gpt-4o-*-transcribe` shut down **2027-02-26**, so don't use them. |
| Extraction | OpenAI Responses API + Structured Outputs: `openai.responses.parse` + `zodTextFormat` (`openai/helpers/zod`) | Model comes from the `OPENAI_MODEL` secret. See §6.4. |
| Schemas | `zod` | One schema file shared by the app and the functions (§10). |
| Time zones | `expo-localization` (`getCalendars()[0].timeZone`) + `date-fns` v4 + `@date-fns/tz` | All interval math in UTC instants. Day boundaries come from the user's time zone (handles DST). |
| UX | `expo-haptics` | Mic start/stop feedback. |
| Tests | `jest-expo` | Scheduler and schema unit tests. |

Install with `npx expo install …` (per AGENTS.md), never `npm install`.

## 6. AI pipeline

### 6.1 `transcribe` Edge Function
- Input: `multipart/form-data` with field `audio` (`capture.m4a`). Sent with plain `fetch` to `${SUPABASE_URL}/functions/v1/transcribe` with `Authorization: Bearer <session.access_token>` and `apikey` headers. (Whether `supabase.functions.invoke` accepts FormData isn't documented, so check it in Spike A or just use `fetch`.)
- Checks: user JWT required, content type, size ≤ 4 MB, per-user cap (e.g. 50 transcriptions/day → `429`).
- Calls `gpt-transcribe`. Inserts a `captures` row (transcript, audio seconds). Returns `{ captureId, transcript }`.
- **Never logs transcript text.** Logs only lengths and timings.

### 6.2 `extract-tasks` Edge Function
- Input (Zod-checked): `{ captureId, transcript (≤5,000 chars), now (ISO with offset), timeZone, dayStart, dayEnd, locale }`.
- **Prompt context:** current local date/time + time zone, active hours, and a **14-day date table**:
  `Mon 2026-11-23 (today) · Tue 2026-11-24 (tomorrow) · Wed 2026-11-25 · …`
  With the table in the prompt, the model looks dates up instead of counting forward, which removes most "next Friday" mistakes.
- **Rules in the system prompt:**
  - one task per distinct action
  - use the last version when the speaker corrects themselves
  - never invent tasks
  - a time with no am/pm → choose the reading between 07:00 and 22:00
  - a time already past today with no date given → tomorrow
  - "on Friday" → `notBefore` = `deadline` = Friday. "By Friday" → `deadline` only.
  - duration estimates when not stated: call 15 min, errand 30, appointment 60, deep work 90–180
  - priority `high` for urgency words or a deadline ≤48 h. `low` for "someday/maybe".
  - titles in the speaker's language
- The model outputs **local wall-clock strings with no offset** (`2026-11-24T10:00`). The device converts them with the user's time zone, so the model never does offset math.
- After parsing: clamp durations to 5–480, drop empty titles, reject unparseable dates (they go to `unparsed`).
- A refusal or `status: "incomplete"` returns `502` with a friendly error code.

### 6.3 Shared schema (replaces the current `src/schemas/ai-schema.ts`)

```ts
// supabase/functions/_shared/task-schema.ts — imported by BOTH the app and the functions
import { z } from 'zod';

const LocalDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);      // no offset
const LocalDateOrDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/);

export const ExtractedTask = z.object({
  title: z.string().min(1).max(120),
  notes: z.string().nullable(),
  priority: z.enum(['high', 'medium', 'low']),
  durationMinutes: z.number().int().min(5).max(480),
  fixedStart: LocalDateTime.nullable(),         // "dentist at 10 tomorrow"
  notBefore: LocalDateOrDateTime.nullable(),    // "on Friday", "next week"
  deadline: LocalDateOrDateTime.nullable(),     // "by Friday 3pm"
  preferredWindow: z.enum(['morning', 'afternoon', 'evening']).nullable(),
  scheduleToCalendar: z.boolean(),              // false → list item only
});

export const ExtractionResult = z.object({
  tasks: z.array(ExtractedTask),
  unparsed: z.array(z.string()),                // fragments the model couldn't act on
});
export type ExtractedTask = z.infer<typeof ExtractedTask>;
```

This follows the Structured Outputs rules: every field is required, optional fields are `nullable`, the root is an object, and `minimum/maximum/pattern` are supported. How your current file maps over: `task → title`, `date/time → fixedStart/deadline`, `scheduleToCalendar` stays, and `success` goes away (HTTP status covers it).

### 6.4 Model choice & cost
- `.env` currently has `OPENAI_MODEL=gpt-5.5`. That model wasn't in OpenAI's current model list when I checked, and it defaults to `medium` reasoning, which is slow for this. **Recommendation:** start with **`gpt-6.1-terra`** at `reasoning: { effort: 'low' }`, then try **`gpt-6-luna`** (about 10× cheaper). Keep the cheapest one that passes the eval set (§13). Changing models is a secret update, not an app release.
- **Rough cost per 1-minute capture:** STT $0.0045 + extraction (~2k in / ~0.5k out on terra) ≈ $0.004 → **about $0.01**. Prices as listed on 2026-11-22.
- **Latency budget** (30 s recording): upload 0.3 s · STT 1–2 s · extraction 1–2 s (while freeBusy runs) · event inserts 0.5 s → **target p50 ≤ 4 s**.

## 7. Ordering & scheduling (`src/lib/scheduler/plan-schedule.ts`, pure)

### 7.1 Ordering
Flexible tasks are ranked by tier, then deadline (earliest first, none last), then capture order:
1. Deadline within 48 h (any priority)
2. `high`
3. `medium`
4. `low`

The list shows scheduled tasks by start time and unscheduled tasks in this tier order.

### 7.2 Slot finding
```
planSchedule(tasks, busy, settings, now) → { placements[], unscheduled[] }
  start   = ceilTo15min(now + 10 min)
  end     = start + max(7 days, days until latest deadline), capped at 14 days
  free    = activeHourWindows(start, end, settings, tz) − expand(busy, bufferMinutes)

  for t in tasks where fixedStart:           // pinned exactly where the user said
      place(t, fixedStart, duration); mark `conflict` if it overlaps busy; free −= slot

  for t in rank(tasks where scheduleToCalendar && !fixedStart):
      window = [max(start, startOfDay(t.notBefore)), t.deadline ?? end]
      slot   = firstFit(free ∩ preferredWindow(t), t.duration, window)   // 15-min grid
            ?? firstFit(free, t.duration, window)                        // drop the time-of-day preference
      slot ? (place(t, slot); free −= slot + buffer)
           : unscheduled(t, reason: 'no_gap_before_deadline' | 'longer_than_any_gap')
```

**Defaults (editable in Settings)**
- active hours 09:00–20:00 every day
- buffer 10 min, 15-min grid
- morning 08–12, afternoon 12–17, evening 17–21
- reminder: popup 10 min before

Per-weekday hours come in Phase 2.

**Busy sources (MVP):** `primary` + the "Voice To-Do" calendar. Other subscribed calendars (for example a separate work calendar) are **not** treated as busy until Phase 3.

## 8. Google Calendar integration

- **Scopes:** `https://www.googleapis.com/auth/calendar.app.created` (create the app's own calendar + manage events on it) and `https://www.googleapis.com/auth/calendar.freebusy` (busy intervals only, no event details). They're requested with `requestScopes()` on the *Connect calendar* step, so sign-in itself only asks for basic profile.
- **App calendar:** `ensureAppCalendar()` checks `user_settings.app_calendar_id`. If it's missing or the calendar was deleted, it calls `POST /calendar/v3/calendars { summary: "Voice To-Do", timeZone }` and saves the ID.
- **Free/busy:** `POST /calendar/v3/freeBusy { timeMin, timeMax, timeZone, items: [{id:'primary'}, {id: appCalendarId}] }` → `calendars[id].busy[{start,end}]`.
- **Event:** `POST /calendar/v3/calendars/{appCalendarId}/events` with `summary`, `description` ("Created by Voice To-Do"), `start/end { dateTime, timeZone }`, `reminders { useDefault:false, overrides:[{method:'popup', minutes:10}] }`, and `extendedProperties.private.voiceTodoTaskId = <task uuid>` (links events back to tasks).
- **Token handling** in `googleFetch()`:
  - `getTokens()` → call.
  - On `401`: `clearCachedAccessToken(token)` → `getTokens()` → retry once.
  - On `403` insufficient scope: send the user to *Connect calendar*.
- **Undo / delete:** delete the events by ID, then the rows.
- **Complete:** patch the event title to "✓ Title" and keep the event as history.
- **Sync back (Phase 2):** when the app comes to the foreground, run an incremental `events.list` (with `syncToken`) on the app calendar. An event you deleted in Google Calendar makes the task *unscheduled*. A moved event updates the task's time.

## 9. Data model (Supabase migration `supabase/migrations/<ts>_init.sql`)

```sql
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  time_zone text not null,
  day_start time not null default '09:00',
  day_end time not null default '20:00',
  buffer_minutes smallint not null default 10,
  reminder_minutes smallint not null default 10,
  app_calendar_id text,
  updated_at timestamptz not null default now()
);

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transcript text not null,
  audio_seconds numeric(6,1),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  capture_id uuid references public.captures(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  notes text,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  duration_minutes int not null default 30 check (duration_minutes between 5 and 480),
  fixed_start timestamptz,
  not_before timestamptz,
  deadline timestamptz,
  schedule_to_calendar boolean not null default true,
  status text not null default 'todo' check (status in ('todo','done')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  calendar_event_id text,
  unscheduled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_status_start on public.tasks (user_id, status, scheduled_start);

alter table public.user_settings enable row level security;
alter table public.captures      enable row level security;
alter table public.tasks         enable row level security;
create policy owner_all on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_all on public.captures for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_all on public.tasks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```
Plus a trigger to keep `updated_at` current. Audio is **never** stored.

## 10. Project structure

```
src/
  app/
    _layout.tsx                 # providers; Stack.Protected guard={!!session} / guard={!session}
    sign-in.tsx
    connect-calendar.tsx
    (app)/_layout.tsx           # NativeTabs (Tasks, Settings). Guarding is done at the root Stack.
    (app)/index.tsx
    (app)/settings.tsx
    task/[id].tsx               # edit sheet
  components/                   # mic-button, level-meter, task-row, capture-result-sheet, undo-toast
  features/capture/
    use-voice-capture.ts        # expo-audio: permission, audio mode, record ≤180 s, stop → uri
    run-capture.ts              # transcribe → (extract ∥ freeBusy) → plan → commit → undo handle
  lib/
    supabase.ts
    google/auth.ts              # the only file that imports the sign-in library
    google/calendar.ts          # ensureAppCalendar, freeBusy, insert/patch/delete/list events
    scheduler/plan-schedule.ts  # + plan-schedule.test.ts
    time.ts                     # tz helpers, local-wall-clock → instant
  schemas/ai-schema.ts          # re-exports supabase/functions/_shared/task-schema.ts
supabase/
  config.toml
  migrations/
  functions/
    _shared/task-schema.ts      # single source of truth (plain zod, no other imports)
    _shared/openai.ts
    transcribe/index.ts
    extract-tasks/index.ts      # + prompt.ts
    deno.json                   # maps "zod" → npm:zod so the shared file works in both runtimes
  evals/extraction-cases.json   # golden transcripts → expected tasks
```

- Add `"exclude": ["supabase/functions"]` to `tsconfig.json`, or the app's `tsc` will fail on Deno code. The shared schema still gets type-checked through the app's import.
- Delete the template screens (`explore.tsx`, hint/badge components) in Phase 0.

## 11. Security & privacy

- **Secrets:**
  - Only `EXPO_PUBLIC_*` values go in the app: Supabase URL, publishable key, Google client IDs.
  - `OPENAI_API_KEY` and `OPENAI_MODEL` are Supabase secrets only.
  - `GOOGLE_OAUTH_CLIENT_SECRET` belongs only in the Supabase dashboard's Google provider settings.
  - `SUPABASE_DB_PASSWORD` is for the CLI only.
  - `.env` is git-ignored and has never been committed (checked).
- **Rename** `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` → `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Without the prefix, Expo doesn't put them in the app at all.
- **Move** server secrets to `supabase/functions/.env` (git-ignored) for local `supabase functions serve`.
- **RLS on every table.** The functions use the user-scoped client from `withSupabase` for user data. The service role touches only the server-only tables (`google_tokens`, `ai_usage`), always filtered to the caller's user id.
- **Input caps:** audio ≤4 MB / ≤3 min, transcript ≤5,000 chars, ≤50 transcriptions and ≤50 extractions (re-runs included) per user per 24 h.
- **Data flow:** audio and transcript go to OpenAI. Calendar data stays on the device (busy intervals only). Audio is deleted from the device cache after a successful transcription. Transcripts are kept as capture history, and the user can delete them.
- **Account deletion** (Apple requires it in-app): delete the app calendar and all rows, then sign out.
- **Disclosures:** a privacy policy covering microphone use, OpenAI processing and Google user data, plus App Store / Play data-safety forms. Microphone permission text goes in the `expo-audio` plugin `microphonePermission` option.

## 12. Milestones

Effort figures are rough, for one developer.

### Phase 0: Foundations & de-risking (~2 days)
- [ ] `app.json`: add `ios.bundleIdentifier` and `android.package` (e.g. `com.medvijenia.voicetodo`, needed for OAuth clients). Add plugins `expo-audio` (with `microphonePermission`) and `react-native-nitro-google-signin` (with `iosUrlScheme`).
- [ ] Install deps with `npx expo install`. Add jest-expo and the tsconfig exclude. Remove the template screens.
- [ ] **Google Cloud:**
  - Web, iOS and Android OAuth clients (Android SHA-1 from `npx eas-cli@latest credentials`).
  - Consent screen in *Testing* with yourself as a test user.
  - Add both calendar scopes, and note the sensitivity label the console shows.
- [ ] **Supabase:**
  - `supabase init` / `link`.
  - Enable the Google provider with all client IDs (web first).
  - Run the migration, then `supabase secrets set` for the OpenAI values.
- [ ] Development build: `npx eas-cli@latest build --profile development` (iOS + Android).
- [ ] **Spike A:** record 20 s on both platforms → multipart upload → `transcribe` → transcript back. This proves the RN FormData upload, Deno `req.formData()`, and that OpenAI accepts the file.
- [ ] **Spike B:** sign in → Supabase `signInWithIdToken` (check the nonce handling: hashed nonce to Google, raw nonce to Supabase; if that fails, fall back to "Skip nonce check") → `requestScopes` → `getTokens` → freeBusy + create a test event in a new app calendar.
- **Exit:** both spikes pass on a real Android and a real iOS device.

### Phase 1: Core loop MVP (~5–7 days)
- [ ] Auth flow with protected routes. *Connect calendar* step + `ensureAppCalendar`.
- [ ] Mic screen: permission states, timer, level meter, 3-min cap, haptics, interruption handling.
- [ ] `transcribe` + `extract-tasks` functions. Shared schema. Eval set v1 (20 cases).
- [ ] `planSchedule` + unit tests (§13).
- [ ] Commit step: rows + events (max 3 in parallel), result sheet, Undo.
- [ ] Task list: Today / Upcoming / Unscheduled / Done, swipe to complete.
- **Exit:** the §3.2 example gives correct events in Google Calendar in ≤5 s, Undo removes them, and `npx expo lint`, `npx tsc --noEmit` and the tests pass.

### Phase 2: Trust & control (~3–5 days)
- [ ] Edit task → reschedule → patch event. Delete / complete → event delete / patch.
- [ ] Sync back from Google Calendar when the app comes to the foreground.
- [ ] Settings: active hours (per weekday), buffer, reminder, sign out, **delete all data**.
- [ ] Typed input. Editable transcript + "re-run".
- [ ] Failure states: offline (keep the recording, retry), mic denied, calendar disconnected, rate limited, model error.
- [ ] Optional "Review before scheduling" toggle.

### Phase 3: Delight (pick based on actual use)
- Auto-stop on silence (metering). Live captions with `gpt-live-transcribe` + `expo-audio` `useAudioStream` (PCM).
- "Replan my day": push overdue / undone tasks into new slots.
- Voice edits ("move gym to 7", "I finished the report").
- Recurring tasks. Splitting long tasks into blocks.
- Busy time from all calendars (`calendar.calendarlist.readonly`).
- One-tap capture from a widget, iOS Shortcut or Android quick-settings tile.

### Phase 4: Launch
- [ ] Google OAuth **verification**: published branding + sensitive-scope review (Google says up to ~10 days). Needs privacy policy and terms URLs and a demo video. *If the app is only for you, you can skip this. Personal and testing use is exempt.*
- [ ] Store listings + privacy forms. Production builds with `eas build`, `eas submit`. OTA fixes with `eas update`.

## 13. Testing & quality

- **Scheduler unit tests**, each a table of inputs and expected outputs:
  - empty calendar, fully booked day, task longer than every gap
  - deadline before any free gap, fixed task overlapping a meeting
  - preferred window full (falls back), `now` inside a meeting
  - buffer rules, tier ordering
  - **DST change day** (e.g. 2027-03-28 in Europe)
  - midnight and horizon edges
- **Schema/contract tests:** Zod parsing of function inputs and outputs, including bad dates and out-of-range durations.
- **Extraction evals:** 30+ golden transcripts covering:
  - relative dates ("next Friday", "in two hours", "tonight")
  - self-corrections, several tasks in one sentence, rambling, no tasks / noise
  - each language you plan to support

  A script scores accuracy per field. **Any model or prompt change has to pass the eval first.**
- **Device QA checklist:** permission denied then granted, a phone call mid-recording, locking the screen, airplane mode, Android 401 token refresh, calendar access revoked in Google settings, calendar deleted in Google Calendar.
- **Done = `npx expo lint` + `npx tsc --noEmit` + tests green** (per AGENTS.md).
- **Product signals:** capture→scheduled success rate, edits per created task (stands in for extraction accuracy), undo rate, p50/p95 latency.

## 14. Risks & open questions

### Risks
| Risk | Mitigation |
|---|---|
| LLM gets a date or time wrong | 14-day date table, local wall-clock output, eval gate, result sheet shows what was booked, Undo |
| `react-native-nitro-google-signin` is a young library | All usage stays in `lib/google/auth.ts`. Fallback is `@react-native-google-signin/google-signin` v17 |
| Google verification delay for sensitive scopes | Start the paperwork early in Phase 2. *Testing* mode is enough for development (test users only, shorter token lifetime) |
| Only the primary calendar counts as busy | Stated in onboarding. All calendars in Phase 3 |
| `gpt-5.5` missing from OpenAI's current list / older STT models shutting down 2027-02-26 | Model name is a secret. Use `gpt-transcribe` now |
| Apple guideline 4.8 (third-party login) | The app is a client for the user's Google Calendar, which is the usual exemption. Be ready to explain this in review |
| Edge Function limits (2 s CPU, 150 s wall clock on the free plan) | The work is network-bound, so it's well inside the limits |

### Open questions: please confirm or change
1. **Auto-schedule with Undo** (no confirm screen)? *Default: yes.*
2. **Dedicated "Voice To-Do" calendar** instead of writing into your primary calendar? *Default: dedicated.* It's safer, and it's still visible in Google Calendar.
3. **Active hours** default 09:00–20:00 every day? Should weekends be off?
4. **Platforms:** iOS + Android only for the MVP (no web)?
5. **Languages:** which languages will people speak? This shapes the prompt and the eval set.
6. **Keep transcripts** as history (user can delete)? *Default: yes.*
7. **Bundle ID / package name:** is `com.medvijenia.voicetodo` OK? It's hard to change after OAuth clients and store listings exist.

## Appendix: facts checked on 2026-11-22 (don't rely on memory)

- **Expo SDK 58 `expo-audio`**: `useAudioRecorder`, `useAudioRecorderState`, `RecordingPresets.HIGH_QUALITY` (m4a) vs `LOW_QUALITY` (Android 3gp/AMR), `requestRecordingPermissionsAsync`, `setAudioModeAsync({ allowsRecording, playsInSilentMode })`, `record({ forDuration })`, `isMeteringEnabled`, plugin option `microphonePermission`. Source: docs.expo.dev/versions/v58.0.0/sdk/audio
- **Expo Router**: `Stack.Protected guard` (plus `redirectTo` in SDK 58). NativeTabs doesn't document `Protected`, so guard at the root Stack. Source: docs.expo.dev/router/advanced/protected
- **Expo env vars**: only `EXPO_PUBLIC_*` gets put into the app, and only when read as `process.env.EXPO_PUBLIC_X`. Source: docs.expo.dev/guides/environment-variables
- **Google Calendar**:
  - `calendar.app.created` authorizes both `calendars.insert` and `events.insert`. `calendar.freebusy` authorizes `freeBusy.query`.
  - Up to 5 reminder overrides per event. `extendedProperties.private` is a string→string map.
  - Source: developers.google.com/workspace/calendar/api
- **OpenAI**:
  - `gpt-transcribe` (m4a OK, 25 MB, $0.0045/min, `languages`, `stream`). `whisper-1` / `gpt-4o-*-transcribe` shut down 2027-02-26.
  - Structured Outputs via `responses.parse` + `zodTextFormat`.
  - Current models: `gpt-6.2-astra`, `gpt-6.2-sol`, `gpt-6.1-terra`, `gpt-6-luna`.
  - Source: developers.openai.com/api/docs
- **Sign-in libraries**:
  - `react-native-nitro-google-signin` 2.3.1: MIT, needs `react-native-nitro-modules` ≥0.36, uses Credential Manager, has `requestScopes` / `getTokens`.
  - `@react-native-google-signin/google-signin` 17.0.0: free tier built on the deprecated Android SDK.
  - Expo's Google auth guide lists both.
- **Supabase**:
  - Edge Functions: `verify_jwt` on by default; `withSupabase` from `npm:@supabase/server@1`.
  - Limits: 2 s CPU, 150 s wall clock (free plan), 256 MB.
  - Expo client uses AsyncStorage storage with `detectSessionInUrl: false`.
