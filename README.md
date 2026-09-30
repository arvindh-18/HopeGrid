# HopeGrid

Hyperlocal disaster preparedness and community response platform: offline-first emergency reporting without login, explainable confidence and priority, coordinator verification and assignment, volunteer response with private chat, and a public safety map.

Specs: `docs/architecture.md`, `docs/features.md`, `docs/rules.md`, `docs/DESIGN.md`.

Evidence and context: [problem](docs/problem.md) · [comparison with other tools](docs/comparison.md) ·
[impact and deployment](docs/impact-and-deployment.md) · [verification (tests)](docs/verification.md) ·
[AI evaluation](docs/evaluation.md) · [scaling and resilience](docs/scaling.md)

## Current state

| Part | State |
|---|---|
| Frontend (`src/`) | All screens S01–S13, connected to the real API through `src/data/realApi.ts` |
| Shared rules (`shared/`) | Implemented and unit-tested (35 tests) |
| API + pipeline | 75 integration tests with Supabase, the LLM and Whisper stubbed (`tests/integration/`) |
| Backend (`server/`, `supabase/`) | All API routes in architecture.md §8, report pipeline (Whisper → local LLM → keyword fallback, all running inside the server), seed + demo reset |

`UI_SKELETON_STATUS.md` is a historical note from the UI phase and is out of date.

## Run

```bash
npm install
npm run dev        # web on http://localhost:5173 + API server on http://localhost:3000
npm test           # business-rule unit tests + API integration tests (no .env or models needed)
npm run build      # typecheck + production build + service worker
npm run preview    # serve the production build
npm start          # API server serving the production build (dist/)
npm run tunnel     # public HTTPS link to :3000 for phones
```

Requires Node.js 22.12+. **Nothing else to install**: the local AI (Qwen 2.5 3B via node-llama-cpp), speech-to-text (whisper.cpp) and ffmpeg all come from npm and run inside the server. Only the laptop that hosts the server needs the AI models (`npm run setup-ai`); phones and other devices just open the website.

First-time setup:

1. `npm install`: installs the code only (small, no models).
   - **Server laptop only:** `npm run setup-ai` downloads the AI and speech models into `models/` (about 2.5 GB, once). Without them the app still works: reports are structured by the keyword fallback and voice notes are left for staff to listen to.
2. Run `supabase/schema.sql` in the Supabase SQL editor, and fill in `.env` (see `.env.example`). It is safe to run again (`create … if not exists`); run it again after pulling changes that add tables (e.g. `volunteer_applications` for volunteer registration).
3. `npm run seed` creates the staff accounts and demo data.
4. In Supabase Auth settings, set JWT expiry to 86400 s so staff sessions last the whole demo.

Android app: the same app packaged with Capacitor 6 (`android/`, `capacitor.config.ts`). `npm run app:apk` builds
`HopeGrid.apk` (uses Android Studio's Java and SDK); install it on a phone, then enter the server's https address
(e.g. the `npm run tunnel` link) on the first screen. Change it later under Menu → Server, so a new tunnel address
needs no new build. The server allows the app's origin (`server/cors.ts`). iOS needs Xcode and is not set up.
Step-by-step guide: `HopeGrid-App-Guide.pdf` (next to the repo folder).

Fixed address with ngrok: set `PUBLIC_SERVER_URL` (your ngrok static domain) in `.env`, save your token once with
`ngrok config add-authtoken <token>`, then run `npm start` and `npm run tunnel:ngrok` (keep both open). The tunnel
command keeps `vercel.json` on that address and checks the server answers. `npm run app:apk` builds the address into
the Android app. Every API request sends `ngrok-skip-browser-warning`, so ngrok's free-plan warning page never
replaces the data.

Reports by SMS when there is no internet (F27): a victim with signal but no mobile data taps **Send by SMS** on the
"report saved" screen; the phone's SMS app opens with the report packed into one message for the HopeGrid number. An
Android phone with a SIM at the server runs the free "SMS Gateway for Android" app and forwards each SMS to
`POST /api/sms/incoming`. Basic phones can text plain words and get a code + PIN back. When the victim's phone is
online again, its outbox uploads the photo, voice note and full text into the same report. Setup:
1. Run `supabase/schema.sql` again (it adds three columns to `reports`; safe to re-run).
2. `.env`: `SMS_WEBHOOK_SECRET` (any long random text), `VITE_SMS_NUMBER` (the gateway phone's number), and for
   replies `SMS_GATEWAY_URL` / `SMS_GATEWAY_USER` / `SMS_GATEWAY_PASSWORD` (shown in the gateway app's Local Server).
3. Gateway phone: install `app-release.apk` from the app's GitHub releases (not on the Play Store; in India Play
   Protect blocks sideloaded SMS apps — turn "Scan apps with Play Protect" off for the install, then on again). Give
   it the SMS permission: App info → App permissions → SMS → Allow; if it's grey, tap it once, then App info → ⋮ →
   Allow restricted settings. Switch on Local Server. `sms:connect` sets its Signing Key for you.
4. `npm start`, then `npm run sms:connect` (gateway phone reaches the ngrok address; it needs mobile data) or
   `npm run sms:connect -- --usb` (phone plugged in by USB with USB debugging on; also turn off "Require Internet
   connection" in the gateway app's webhook settings). Rebuild the website/app so it contains `VITE_SMS_NUMBER`.

Auto-dispatch and SOS (F28): on the coordinator dashboard, **Auto-dispatch** can be Off, **When overloaded** (more
than N incidents waiting) or **Always**. The system then offers each waiting incident, most urgent first, to the
best-matched available volunteer. They get a full-screen SOS in the app, an SMS they can answer with YES or NO, and
a push notification if Firebase is set up. No answer within the set minutes counts as a decline, and it goes to the
next volunteer. Coordinators can still cancel or reassign, and auto-sent incidents stay off the public map until
verified. After pulling this, run `supabase/schema.sql` again. Push notifications (optional):
1. Firebase console → create a project → add an Android app with package `app.hopegrid` → download
   `google-services.json` into `android/app/`.
2. Project settings → Service accounts → Generate new private key → save it as `secrets/firebase-service-account.json`
   and set `FIREBASE_SERVICE_ACCOUNT=./secrets/firebase-service-account.json` in `.env`. Both files are git-ignored.
3. `npm run app:apk` (it prints "SOS push notifications: on"), install it on volunteers' phones, log in and allow
   notifications. Restart `npm start`.

Website on Vercel, server on this laptop: `vercel.json` makes Vercel serve the pages and forward `/api/*` to the
laptop. Run `npm start`, then `npm run tunnel:vercel` (keep both open). It starts a Cloudflare quick tunnel and writes
its address into `vercel.json`; commit and push that file so Vercel redeploys. The quick-tunnel address changes each
time the tunnel restarts, so repeat the push after every restart. No keys are needed on Vercel.

Demo on phones: `npm run build && npm start`, then `npm run tunnel` in a second terminal and open the printed `https://…trycloudflare.com` link (HTTPS is needed for GPS and the microphone).

In dev builds, the lime **Demo** button can reset demo data (`/api/dev/reset`, only from the server laptop itself) or simulate offline.

Languages: the victim screens (home, report, tracking, map, chat) are in English, தமிழ் and हिन्दी, chosen with the
picker in the header and remembered per phone. Coordinator and volunteer screens are English only.

Other scripts: `npm run eval` (AI accuracy on synthetic reports; add `-- --data heldout` for the held-out set),
`npm run bench` (model latency), `npm run cleanup` (retention: dry run unless `-- --apply`).

Live updates: coordinator, volunteer and tracking screens get a live "something changed" signal (Server-Sent
Events) and refresh at once. While it is connected they poll only every 30 s; without it they poll as before.

Seeded staff accounts (architecture.md §12, created by the server seed script): `admin@demo.app`, `ravi@demo.app`, password `Demo@123`.

Volunteer registration: anyone can apply at `/volunteer/register` (linked from Home and Login) with their details, skills,
equipment, vehicle and a photo of an ID proof. A coordinator reviews it under **Volunteers** in the admin menu;
approving makes them a volunteer who can log in and be assigned, rejecting (with a reason) removes their login and
deletes the photo.

## Structure

```
hopegrid/
├── docs/                 specs (architecture, features, rules, design)
├── shared/               types, constants and business rules used by frontend and server
├── src/
│   ├── data/             Api interface (index.ts), realApi (fetch /api/*)
│   ├── offline/          outbox queue, device id, online state
│   ├── components/ hooks/ lib/ pages/
├── tests/                rule tests (vitest)
├── public/               PWA icon
├── server/               Express API (Supabase via service role)
├── supabase/             schema.sql (run once in the Supabase SQL editor)
└── models/               AI + speech models, downloaded by npm run setup-ai (gitignored)
```

## How the frontend reaches the backend

Pages only call `src/data/index.ts` (`api`), which is backed by `src/data/realApi.ts` (fetch to `/api/*`). In development, Vite proxies `/api` to `http://localhost:3000`. In demo mode, `npm start` serves both the API and the built app from port 3000.

## Honest scope

| | What |
|---|---|
| **Real and tested** | Offline report outbox; report API with idempotent resend; reports by SMS through a gateway phone, with the later upload joining the same report (API-tested; the phone opening its SMS app with the packed report checked in the Android emulator; not yet tried with a real gateway phone); local speech-to-text (Whisper) with English translation; local AI structuring (Qwen 2.5 3B) with keyword fallback, and the keyword type used when the rules find one (BR-11a); confidence and priority with reasons; duplicate flags (never auto-merged); volunteer matching; assignment workflow; private chat; public map limited to coordinator-verified incidents; Tamil/Hindi victim screens; retrying processing queue; live change signals (SSE) with polling fallback; retention clean-up script; volunteer self-registration with coordinator review of an ID-proof photo. See `docs/verification.md`. |
| **Simulated** | Phone verification: no SMS is sent, the code is always `123456`. Escalation to emergency services: only a log line, no external call. Seeded demo staff and incidents. |
| **Measured but modest** | On synthetic reports the incident type is right 70% of the time (both sets); all fields right for only about a quarter of reports; Tamil is weak. See `docs/evaluation.md`. |
| **Manual by design** | Volunteer ID check: a coordinator looks at the photo; nothing is checked automatically (no Aadhaar/DigiLocker lookup). |
| **Simulated → manual** | WhatsApp alert to a volunteer: a "Send on WhatsApp" button prepares the message; the coordinator presses Send (automatic sending via the WhatsApp Business API is roadmap). |
| **Not built (roadmap)** | Push notifications on the website (only the Android app gets them); status-update SMS (only the receipt is sent back); a local database so the server works with no internet at all; automatic ID verification; email notice to applicants when they are approved or rejected; automatic WhatsApp notifications; rate limiting on the public endpoints; more than one server (live signals are in-process); a native-speaker review of the translations; testing with real users; a licence file. |
