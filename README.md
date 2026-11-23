# Voice To-Do

[![CI](https://github.com/MedviJenka/todo-mobile/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MedviJenka/todo-mobile/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Expo SDK 58](https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Edge%20Functions-3ecf8e?logo=supabase&logoColor=white)

<!--
Screenshots: put PNGs/GIFs in docs/screenshots/ and uncomment.
<p align="center">
  <img src="docs/screenshots/capture.gif" width="240" alt="Speaking tasks into the mic" />
  <img src="docs/screenshots/tasks.png" width="240" alt="Task list scheduled into free time" />
  <img src="docs/screenshots/calendar.png" width="240" alt="Tasks booked in Google Calendar" />
</p>
-->

A personal iOS/Android app: tap the mic, say what you need to do, and it becomes tasks that are ordered and booked into free time in your Google Calendar, with an Undo. Built with **Expo SDK 58**, **Expo Router**, **Supabase** (auth, Postgres, Edge Functions) and **OpenAI** (speech-to-text + extraction). The full design is in [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md).

```
 speak ──► transcript ──► tasks (AI) ──► ordered ──► fitted into free time ──► Google Calendar events
         (transcribe fn)  (extract-tasks fn)  └──── on device, pure TypeScript ────┘   (+ Supabase rows)
```

The AI only interprets what you said. All time math (ordering, free slots, buffers, DST) is the pure, unit-tested `planSchedule()` running on the phone. Calendar data never leaves the device. The server only sees audio and transcripts.

## Project layout

```
src/
  app/                          # routes only
    _layout.tsx                 # providers + guard: sign-in → connect-calendar → (app)
    sign-in.tsx                 # Google sign-in (Supabase browser OAuth)
    connect-calendar.tsx        # grant Calendar scopes, create the "Voice To-Do" calendar
    (app)/index.tsx             # task list + mic (NativeTabs)
    (app)/settings.tsx          # active hours, buffer, reminder, sign out, delete all data
    task/[id].tsx               # edit sheet (formSheet)
  components/                   # capture panel, mic, task row, ui/ primitives (aurora, rainbow ring, …)
  constants/theme.ts            # design tokens: palette, rainbow spectra, gradient helper, spacing
  features/capture/             # recorder hook, run-capture pipeline, capture state
  features/tasks/               # task operations (row + event kept in sync), list grouping
  lib/
    google/auth.ts              # OAuth round trip + cached Calendar access tokens
    google/calendar.ts          # app calendar, freeBusy, events (called from the device)
    scheduler/plan-schedule.ts  # ordering + slot finding (+ tests)
    time.ts                     # re-exports the shared zone math + display helpers
    api.ts db.ts supabase.ts auth.ts errors.ts
  schemas/ai-schema.ts          # re-exports the shared zod contract
supabase/
  migrations/                   # tables + RLS
  functions/_shared/            # task-schema.ts + zoned-time.ts are shared with the app
  functions/transcribe/         # audio → transcript
  functions/extract-tasks/      # transcript → tasks (Responses API + Structured Outputs)
  functions/google-token/       # holds the Google refresh token, mints Calendar access tokens
  evals/                        # golden transcripts + scorer for prompt/model changes
```

## Design

Neutral surfaces, one brand blue, and a rainbow spectrum used only as an accent: the drifting aurora behind screen headers, the ring around the mic, and progress bars. Completed checks are plain green. Content always sits on solid cards, so text contrast never depends on the gradient. Gradients are React Native's built-in `backgroundImage` (no native gradient module) and motion is Reanimated 4: slow loops, springy presses, layout transitions when tasks move. Every looping animation holds still when the system's Reduce Motion setting is on.

## One-time setup

You need an Expo account, a Supabase project, a Google Cloud project and an OpenAI API key. The app id is `com.medvijenia.todo` (iOS bundle id and Android package).

### 1. Google Cloud

1. **APIs & Services → Library**: enable the **Google Calendar API**.
2. **Google Auth Platform → Audience**: keep the app in *Testing* and add your Google account as a test user. Personal use doesn't need Google verification.
3. **Data Access**: add `openid`, `userinfo.email`, `userinfo.profile`, `…/auth/calendar.app.created` and `…/auth/calendar.freebusy`.
4. **Clients**: create one **Web application** client with the authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Copy its ID and secret.

### 2. Supabase (you deploy)

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push                                         # tables + RLS
cp supabase/functions/.env.example supabase/functions/.env   # OPENAI_API_KEY, ALLOWED_EMAILS=<you>, Google web client id + secret
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy transcribe extract-tasks google-token
```

Then in the dashboard:

- **Authentication → Providers → Google**: enable it and paste the web client ID and secret.
- **Authentication → Providers → Email**: turn it off. The app signs in with Google only, and the function allowlist trusts only Google-created accounts.
- **Authentication → URL Configuration → Redirect URLs**: add `todo://**` (dev and release builds) and `exp://**` (Expo Go).

`ALLOWED_EMAILS` restricts the functions (and so your OpenAI spend) to your own Google account. It is required: unset means every request gets `403`; `ALLOWED_EMAILS=*` allows any signed-in user. `MAX_CAPTURES_PER_DAY` caps transcriptions and extractions (re-runs included) per user per 24 hours, each counted separately (default 50).

### 3. App environment

```bash
cp .env.example .env    # EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

EAS Build can't see `.env`, so create the same variables in each EAS environment:

```bash
for env in development preview production; do
  for name in EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY; do
    npx eas-cli@latest env:create --environment $env --name $name --value "<value>" --visibility plaintext
  done
done
```

### 4. Development build

Build a dev client once with EAS, install it, then iterate with Metro:

```bash
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest device:create          # iOS only: register your iPhone first
npx eas-cli@latest build --profile development --platform ios
npx expo start                            # open the installed dev build
```

Rebuild only when native dependencies or `app.json` plugins change. Ship JS fixes with `eas update`. Every native module the app uses also ships in Expo Go, so Expo Go works for quick checks; sign-in there relies on the `nip.io` redirect rewrite in `lib/google/auth.ts`.

## Commands

```bash
npm test                 # scheduler, zone math, schema contract, list grouping (jest-expo)
npm run typecheck        # tsc --noEmit
npm run lint             # expo lint
npm run check:functions  # deno check of the Edge Functions + the eval runner
npm run evals            # run the extraction eval against OpenAI (needs supabase/functions/.env)
npx expo-doctor
```

**Any change to the prompt or `OPENAI_MODEL` must pass `npm run evals` first.** Add cases in the languages you speak to `supabase/evals/extraction-cases.json`.

## Making it your own

In `app.json`: `owner`, `extra.eas.projectId` (remove it, then run `eas init`), `ios.bundleIdentifier` / `android.package`, `scheme`, name and icons. If the scheme changes, update the Supabase redirect URLs too.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Blank browser page after Google consent | The app's redirect URL isn't in Supabase → Redirect URLs, so Supabase fell back to the Site URL. Add `todo://**` and `exp://**`. |
| "Access blocked: app has not completed verification" | Add your account as a test user under Google Auth Platform → Audience. |
| "Google Calendar access wasn't granted" | Google shows each Calendar permission as an unticked checkbox. Tap Connect again and tick both. |
| Back on the "Reconnect your calendar" screen | A Calendar call returned 401/403 (scope revoked or expired grant). Tap Reconnect. |
| `This Google account is not allowed…` | Your email isn't in the `ALLOWED_EMAILS` secret. |
| `Missing EXPO_PUBLIC_…` on startup | `.env` is missing (local) or the EAS environment variables are (cloud build). Run `npx expo start -c` after editing `.env`. |

## License

MIT. See [LICENSE](LICENSE).
