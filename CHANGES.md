# CHANGES — score-raising pass (2026-09-29)

Every number here comes from a command that was run on 2026-09-29 on an Apple M2 laptop with 8 GB of RAM.
Nothing is committed or pushed. The database was not touched: no seed, no reset, no reads or writes against
Supabase. All tests use an in-memory fake.

## Phase 1 — Security

| Item | What was done | Status |
|---|---|---|
| Secrets | Real Supabase keys in `.env.example` replaced with placeholders. No tracked file contains a key now. | Done. **You must rotate both keys**: they remain in the public history in commits `962d3d2`, `6ccb65a`, `0197709`. |
| Rate limiting / lockout on `/track*` | Designed (proposals A–D) | **Declined by the owner** ("no need to add these security features"). Recorded as a known risk: the 4-digit PIN can be guessed by repeated requests. |
| `POST /api/reports` abuse controls | Base64 and file-signature checks: photos must be real JPEG; audio must match its claimed WebM/MP4/Ogg type (also for chat voice messages). Caps and rate limits declined with A–D. | Done (checks). Verified on ffmpeg-made files (9/9) and real Chrome 154 recordings (WebM and MP4 accepted). Safari not verified. |
| Public-map spam (BR-80) | Option 1 approved and applied: NEW incidents are never public; public only after a coordinator verifies, assigns or resolves. `PUBLIC_MIN_CONFIDENCE` removed. Tests and `docs/rules.md` updated. | Done |
| Dev safety | `/api/dev/reset` only answers requests made on the server laptop: loopback address, no forwarding headers, `Host: localhost`. Tunnelled requests get 403. | Done and tested. The startup warning needed `server/index.ts` (declined with C), so it's **not done**. |

## Phase 2 — Verification evidence

- New `tests/integration/`: a Supabase fake built from `supabase/schema.sql`, LLM/Whisper stubs, and the real
  routers wired like `server/index.ts`.
- **Tests:**
  - 42 API tests in Phase 2, 48 after Phase 4, 55 after the approved follow-ups; **83 tests in total, all passing**
  - they cover everything the task listed, plus login and roles, restart recovery and the dev-reset guard
  - **13 of 13 deliberate code breaks were caught** (9 during the phases, 4 for the follow-ups)
- `docs/verification.md`: commands, real output, and what is not covered.
- `npm run test:all` isn't needed: `npm test` already runs both files.

## Phase 3 — AI accuracy evaluation (docs/evaluation.md)

- **Data (synthetic, author-written, clearly marked):**
  - `eval/reports.jsonl`: 40 reports — 12 English, 10 Tamil, 10 Hindi, 8 Tanglish/Hinglish
  - `eval/heldout.jsonl`: 20 more, written before any prompt change was run on them
  - `eval/duplicate-pairs.jsonl`: 24 labelled pairs
  - labelling guide in `eval/README.md`
- **Scripts:** `eval/run.ts`, `eval/prompt-experiment.ts`, `eval/diagnose-type-bias.ts`, `eval/bench.ts`, `eval/score.ts`.

| Real results | Keyword rules | Local AI (production) |
|---|---|---|
| Main set: type / all fields | 65% / 28% | 58% / 18% |
| Held-out set: type / all fields | 60% / 20% | 55% / 25% |
| Tamil type (main set) | 20% | 30% |

- **The AI does not beat the keyword rules on incident type.** It's better at people counts (93% vs 85%) and the
  danger flag (73% vs 55%).
- **A bias was found and diagnosed:** 10 of 17 AI type errors were `HEAVY_RAIN`. It isn't the grammar or state
  between reports.
- **Three prompt fixes were tested against a rule stated in advance. None passed on the held-out set**, so
  production is unchanged.
- **One combination was put to you and approved:** keyword type when found, else AI type (BR-11a). Re-measured in
  production: **type 70% on both sets** (from 58% / 55%); no other field changed.
- **Duplicate detection:** precision 0.64, recall 0.58 on pairs written to probe its edges.
- **Latency on the M2:** speech 1.2–6.7 s; AI 5.1–6.4 s per report; about 650 reports/hour at most.
- **Memory:** heavy swapping on 8 GB caused a 17-minute outlier.

## Phase 4 — Resilience and scalability

| Item | What was done |
|---|---|
| Job durability | `server/pipeline.ts`: queue with at most 2 reports in progress; retries after 5 s, 30 s and 2 min; a sweep every 10 min re-queues PENDING and FAILED reports; restart recovery kept (started by the existing `processPendingReports()` call, so `server/index.ts` is untouched). |
| **Bug fixed** | A failure between creating an incident and linking its report left an **orphan incident**, with the report stuck in FAILED. This is the likely origin of `RPUXR` in your database. Retries now reuse that incident. Tested. |
| Real-time | Proposed in this phase, then **implemented after your approval**: live change signals (see "Approved follow-ups"; `docs/scaling.md` §7). |
| Retention | `server/scripts/cleanup.ts`: dry run by default, `--apply` to delete closed incidents older than N days in foreign-key order. Tested against the schema's foreign keys. Policy proposal in `docs/scaling.md` §6. |
| Degraded modes | Documented in `docs/scaling.md` §5. Re-verified on 2026-09-29: `AI_MODEL=none` → `source=KEYWORDS type=FLOOD`. Database outage → 500 + outbox retry (test). Transcription failure (test). Map tiles blocked → list view with notice, Map button disabled (headless Chrome, 9 tile requests blocked). |
| Load numbers | Database round-trips per request measured and pinned as test budgets. Polling load computed from them. No real load test was run. |

## Phase 5 — Documentation

- New: `docs/problem.md`, `docs/comparison.md`, `docs/impact-and-deployment.md`, `docs/scaling.md`,
  `docs/verification.md`, `docs/evaluation.md`. Every external fact is linked to a page read on 2026-09-29.
- README: evidence links, a languages note, and an **"Honest scope"** section.
- PROJECT.md (in `~/Downloads`, where the owner moved it): updated sections and a new §18 Evidence.
- A mistake I had made earlier was corrected: Whisper's language list has **14** languages used in India (checked in
  `whisper/tokenizer.py`), not "~13".

## Phase 6 — Files touched

**Server:** `server/pipeline.ts` (queue, retries, orphan reuse), `server/transcribe.ts` (split out `transcribeAudio`),
`server/ai.ts` (exports for the evaluation; stale header fixed), `server/routes/victim.ts` (upload checks, queue),
`server/routes/messages.ts` (upload checks), `server/routes/dev.ts` (local-only guard), `server/storage.ts`
(`removeFiles`), new `server/scripts/cleanup.ts`.
**Shared:** `shared/publicView.ts` (BR-80); `shared/constants.ts` (constant removed — approved with Option 1).
**Tests:** `tests/rules.test.ts`, new `tests/integration/*`.
**Evaluation:** new `eval/*` (synthetic data + scripts); `eval/results/` is git-ignored.
**Docs:** `docs/rules.md` (BR-80), `docs/architecture.md` (new files listed in §5), the six new docs, `README.md`, `TODO.md`,
`.env.example`, `.gitignore`; `PROJECT.md` in `~/Downloads`.

## Approved follow-ups — implemented after "ok do it"

| # | Item | What was done | Evidence |
|---|---|---|---|
| 1 | **Incident type rule (BR-11a)** | `chooseType()` in `shared/keywordExtractor.ts`: keyword type when the rules find one, else the AI's; applied in `server/ai.ts`. `docs/rules.md` BR-11a. | 2 unit + 1 API test; mutation M10 caught. **Re-measured in production: type 70% on both sets** (was 58% / 55%); other fields unchanged; 0 fallbacks. |
| 2 | **npm scripts** | `package.json`: `eval`, `bench`, `cleanup`. `typecheck` now also checks `server/scripts/cleanup.ts` and the `eval/` scripts. | Type check passes. |
| 3 | **Live change signals (SSE)** | New `server/events.ts`. Endpoints `GET /api/admin/events`, `GET /api/volunteer/events`, `POST /api/track/events`; signals carry no data (victims: no ids). Client: shared fetch-based stream reader in `src/data/realApi.ts`, `Api.watchAdmin/watchVolunteer/watchTrack` (`src/data/index.ts`), `usePoll(…, watch)`. Used by the dashboard, incident page, volunteer home, assignment page and tracking page. Docs: architecture D12 + §8, rules AR-35, scaling §7. | 6 API tests (3 runs in a row, all passing); mutations M11–M13 caught. Browser check: live → refresh 40 ms after a signal and no polling; stream 404 → normal 5 s polling. |
| 4 | **Polling constants** | `POLL_RESOURCES_MS` (30 s) and `POLL_RESOURCE_PICKER_MS` (60 s) replace the inline numbers in `Resources.tsx` and `IncidentPage.tsx`; stream constants added to `shared/constants.ts`. | Type check passes. |

After these: **83 tests pass** (28 rule + 55 API), **13 of 13 mutations caught**, type check and build pass.

## WhatsApp button for assignments (2026-09-30)

- On the coordinator's incident page, an active assignment now has **Send on WhatsApp**. It opens WhatsApp with the
  volunteer's number and a ready message: type, priority, incident code, area and a link to accept. The coordinator
  presses Send.
- It uses a `wa.me` link: no API, account or cost. The message never contains victim details.
- **Files:**
  - `src/lib/whatsapp.ts` (new)
  - `src/pages/admin/IncidentPage.tsx`
  - `shared/types.ts` (`volunteerPhone` in the staff-only incident detail)
  - `server/routes/admin.ts`
  - docs: features F14, architecture §8
- **Tests:** `tests/whatsapp.test.ts` (2) and an API assertion; **85 tests pass**, type check and build pass.
- **Demo note:** the seeded volunteers have no phone numbers. Volunteers who register themselves (below) give one;
  for seeded ones, add real numbers in Supabase (`profiles.phone`, e.g. `+9198…`), or the button explains that
  there's no number.
- Automatic sending (WhatsApp Business API, template approval, volunteer opt-in) is roadmap.

## Volunteer registration with ID proof (2026-09-30)

Requested: a portal where volunteers enter their details and equipment and upload a proof, which a coordinator
checks before adding them to the volunteer list.

- **Volunteer side** (`/volunteer/register`, linked from Home in all three languages and from Login):
  - name, phone, email and password; skills; equipment; vehicle; optional GPS and area
  - a photo of an ID proof, compressed on the phone like report photos
  - a consent checkbox; the form lists what is still missing
- **Coordinator side** (`/admin/volunteers`, "Volunteers" in the admin menu):
  - *Waiting for review* (with a count): each application with its details, tags, the ID photo, Approve, and Reject
    (reason required)
  - *Volunteers*: everyone approved, with availability, phone and a WhatsApp link
  - *Rejected*
- **How it works (rules.md BR-150):**
  - Applying creates the Supabase login at once; the password is held only by Supabase Auth.
  - Logging in says "waiting for a coordinator to approve" until an admin approves. Approving creates the volunteer
    profile, so the person can log in and is suggested for incidents straight away.
  - Rejecting deletes the login and the photo; the person may apply again.
- **Lead-only files changed** (treated as approved by the request):
  - `supabase/schema.sql`: new `volunteer_applications` table and index, with RLS on
  - `shared/types.ts`: application and volunteer-list types
  - `shared/constants.ts`: `MIN_PASSWORD_LENGTH = 8`
  - `src/App.tsx`: 2 routes
  - `src/data/index.ts`: 5 `Api` functions
  - `server/index.ts`: mounts the new router
- **Other files:**
  - new: `server/routes/applications.ts`, `src/pages/VolunteerRegister.tsx`, `src/pages/admin/Volunteers.tsx`
  - changed: `server/routes/admin.ts`, `server/routes/authRoutes.ts`, `src/data/realApi.ts`, `src/components/Layout.tsx`,
    `src/pages/Home.tsx`, `src/pages/Login.tsx`, `src/i18n/{en,ta,hi}.ts`
  - tests: `tests/integration/{api.test.ts,fakeSupabase.ts,testApp.ts}`
  - docs: `docs/features.md` F26/S12/S13, `docs/rules.md` BR-150, `docs/architecture.md` §2/§5/§6.8/§8,
    `docs/verification.md`
- **Evidence (run 2026-09-30):**
  - 12 new API tests; **97 tests pass**; type check and build pass
  - 3 more deliberate breaks caught (M14–M16)
  - both screens checked in headless Chrome against a stand-in API
- **⚠️ Before using it on the real database:** run `supabase/schema.sql` again in the Supabase SQL Editor. It only
  adds the new table; existing tables and data are untouched. Until then, sending an application fails (its login
  is removed again) and the Volunteers page shows an error; existing logins keep working.
- **Not built:** automatic ID checks; emails to applicants about the decision; translating the registration form
  (English only, like the other staff screens).

## Safety map radius (2026-09-30)

Requested: "show reports only up to a certain radius" on the safety map.

- **Behaviour (rules.md BR-85):**
  - With the phone's location, the map and list show only hazards within **2, 5 or 10 km** (default 5 km,
    remembered on the phone).
  - A dashed circle marks the radius and the map zooms to fit it.
  - The page says how many hazards are farther away.
  - Without a location, everything is shown with a note asking to allow location.
  - The "N active hazards within 2 km" banner is unchanged.
- **Privacy:** the filtering happens on the phone, so its location is never sent to the server. The public API is
  unchanged.
- **Files:**
  - `shared/constants.ts` (lead-only; `MAP_RADIUS_OPTIONS_M`, `MAP_DEFAULT_RADIUS_M`)
  - `shared/publicView.ts` (`withinRadius`)
  - `src/pages/PublicMap.tsx`, `src/components/SafetyMap.tsx`
  - `src/i18n/{en,ta,hi}.ts` (6 new texts each)
  - `tests/rules.test.ts`
  - docs: features F19, rules BR-85 + constants, verification
- **Evidence (2026-09-30):**
  - 1 new rule test; **98 tests pass**; type check and build pass
  - checked in headless Chrome with a simulated GPS position (desktop English, phone Tamil, location denied)
- **Also found while fixing "the map doesn't load":** nothing was wrong in the code. Only a stand-alone Vite dev server
  was running, with no API server behind it, so `/api/public/incidents` answered 502. Start the app with `npm run dev`,
  or `npm run build && npm start`.
- **Clearer message when the server is down** (`src/data/realApi.ts`): a 502/503/504 with no error details from our
  server comes from the dev proxy or the tunnel, so it's now reported as "You're offline or the server can't be
  reached." (translated) instead of "The server returned an error (502)". The map's error box uses the chosen language.
  Reports are unaffected: they stay queued on the phone and retry, as before.

## Android app (2026-09-30)

Requested: turn the website into an app, plus a PDF on how to use it.

- **How:** Capacitor 6 wraps the existing React app. Every screen, language and feature is the same code as the
  website. Capacitor 6 rather than 8 because it matches the Android tools on this Mac (Java 17 in Android Studio,
  SDK 34); 8 needs Java 21 and SDK 35+.
- **What changed in the code:**
  - `src/lib/serverUrl.ts` (new): the app needs the server's full address. The website still uses its own site,
    so it's unchanged. In the app the address is entered on first start (`src/pages/ServerSetup.tsx`, which checks
    it before saving) and can be changed under Menu → Server, so a new tunnel address needs no rebuild. It can also
    be built in with `VITE_SERVER_URL`.
  - `src/data/realApi.ts`: requests go to that address.
  - `src/main.tsx`: no offline service worker inside the app, since its files are already on the phone.
  - WhatsApp assignment links use the server address (`publicWebUrl()`), because the app's own address would
    point at the phone.
  - `server/cors.ts` (new, mounted in `server/index.ts`): the server now accepts calls from the app's origins
    (`https://localhost`, `capacitor://localhost`) only. Logins are bearer tokens, not cookies.
  - Android project `android/`:
    - permissions for location, microphone and camera
    - HopeGrid icon and splash screen
    - `npm run app:apk` → `HopeGrid.apk`; `npm run app:open` opens Android Studio
- **New dependencies (approved):** `@capacitor/core`, `@capacitor/android` 6.2.2; `@capacitor/cli` 6.2.2 (dev).
- **Evidence (2026-09-30):**
  - 4 new tests (app access to the server; address clean-up); **102 tests pass**; type check and build pass
  - APK built and installed on the Android 14 emulator (Pixel 3a), against a temporary server on port 3001 without AI,
    through a quick tunnel. Checked:
    - the first-start screen accepted the tunnel address
    - Home matches the website
    - Android's location prompt, then the map with tiles, the radius circle and the hazard pin
    - the Report screen captured GPS (±5 m)
    - Android's microphone prompt, then recording ran
    - coordinator login and the dashboard
  - No report was sent, and nothing was written to the database.
- **Not tested:** a real phone; the camera (photo / ID proof) inside the app; live updates in the app (screens fall
  back to polling if needed); iOS, which needs Xcode (not installed).

## Fixed server address with ngrok (2026-09-30)

- **Settings in `.env`** (documented in `.env.example`; the real values are only in `.env`, never committed):
  - `PUBLIC_SERVER_URL`: the ngrok static domain
  - `NGROK_AUTHTOKEN`: optional; empty here, because the token is saved by `ngrok config add-authtoken`
  - `DEV_MODE=false`, since the server is public
- **`npm run tunnel:ngrok`** (`server/scripts/tunnel-ngrok.ts`):
  - runs `ngrok http --url=$PUBLIC_SERVER_URL $PORT`
  - points `vercel.json` at the same address
  - checks the server answers through the tunnel
- **`npm run app:apk`** builds `PUBLIC_SERVER_URL` into the app; it can still be changed under Menu → Server.
- **The ngrok warning page:** free ngrok addresses show a "You are about to visit" page to browser-looking requests.
  Every API call now sends `ngrok-skip-browser-warning`, and `server/cors.ts` allows that header from the app; the
  integration test checks it.
- **Checked (2026-09-30):**
  - 102 tests pass
  - the rotated Supabase keys work
  - `volunteer_applications` exists
  - the APK contains the address and no Supabase keys
- **Not yet checked through the live tunnel:** it needs the ngrok token saved on this Mac.

## Reports by SMS without internet (2026-09-30, F27)

Judges' feedback: reports only reached coordinators once the phone had internet. Now a report goes out by SMS
whenever the phone has signal, even without mobile data.
- **Phone:** "Send by SMS" on the "report saved" screen opens the phone's own SMS app with the report packed into
  one message (`shared/sms.ts`, BR-06): code, PIN, GPS, people, needs, 80 characters of place and 200 of text.
  The number comes from `VITE_SMS_NUMBER`. Tamil and Hindi text included.
- **Gateway:** an Android phone with a SIM runs "SMS Gateway for Android" and forwards every SMS to the new
  `POST /api/sms/incoming` (`server/routes/sms.ts`). It is signed with the app's HMAC signature, or uses a bearer
  secret, and is off without `SMS_WEBHOOK_SECRET`. `npm run sms:connect` registers it; `--usb` works over a cable,
  with no internet needed on the phone.
- **Basic phones:** plain words become a report; the reply carries a new code and PIN. More plain SMS from the
  same number within 60 minutes are added to that report.
- **Later upload (BR-07):** when the phone gets online, its outbox sends the full report. It joins the SMS report
  (same code and PIN) instead of creating a second one. The photo, voice note and full text are added, the report
  is read again, and new facts are added to the incident (`laterFacts`: only adds, never removes). A report is never
  changed while it is being processed; the change gets a retryable 500.
- **Coordinators:** "✉️ SMS" on the dashboard. The report card shows "By SMS", the sender's number (verified),
  media still on the phone, and when the full report arrived.
- **Tracking (BR-90):** a linked report keeps its step while later details are read, instead of dropping back to
  "Report received".
- **Database:** `reports` gets `channel`, `pending_media` and `completed_at`, plus an index on `phone`.
  `schema.sql` has `alter table … add column if not exists` lines for existing databases. The server warns at
  startup if they are missing.
- **Evidence (2026-09-30):**
  - 114 tests pass (12 new: 6 rule tests, 6 API tests); type-check clean
  - 5 deliberate code breaks (M17–M21), all caught
  - Android emulator, Wi-Fi and data off: "Send by SMS" opened Google Messages with the packed report, which was
    sent, and the server's parser reads that exact message correctly
  - **Not yet run:** a real gateway phone, and the live database (it needs `schema.sql` re-run first)

## Auto-dispatch and SOS to volunteers (2026-10-01, F28)

- **Coordinator switch** on the dashboard: Off / When overloaded (more than N waiting) / Always, plus the answer time.
  It's stored in a new `settings` table.
- **The system sends the best-matched volunteer** (existing ranking), most urgent incidents first, one offer per
  volunteer at a time.
- **SOS in three ways:**
  - a full-screen SOS in the app, with a countdown and only Accept / Decline;
  - an SMS through the gateway phone (answer YES or NO with the code);
  - a Firebase push notification in the Android app, so it arrives even when the app is closed.
- **No answer in time** counts as a decline, and the incident goes to the next volunteer. Status changes are now
  compare-and-set, so a late answer and the deadline can't both win.
- **Humans stay in charge:** every step is logged; coordinators can cancel or reassign; auto-sent incidents stay off
  the public map until verified or the volunteer is on site (BR-165). The AI still never assigns (AR-20).
- **Code:**
  - new: `shared/dispatch.ts`, `server/dispatch.ts`, `server/push.ts`, `server/smsGateway.ts`, `src/lib/push.ts`;
  - the assignment steps moved from the volunteer route into `server/dispatch.ts`, so the app and SMS answers share
    them.
- **New package:** `@capacitor/push-notifications` 6.0.5 (approved). The server calls Firebase over HTTP, so it needs
  no Firebase package.
- **Database:** `assignments.auto`, `assignments.respond_by`, `incidents.auto_dispatched_at`, `profiles.push_token` and
  the `settings` table. Re-run `schema.sql`; the server warns at startup if they're missing.
- **Evidence:** 127 tests pass (13 new); type-check clean; 6 deliberate breaks, all caught (one after tightening a test).
  Not yet on devices: the SOS screen on a real phone, and push with a real Firebase project.

## Community help from the map (2026-10-01, F29)

- **Split by trust (owner's choice):** approved volunteers take an unassigned verified hazard straight from the map;
  anyone else sends an offer that a coordinator reviews; a coordinator can open a hazard to anyone, with a public task.
- **Screens:**
  - Map (map and list view): "Can you help?" with take, offer or join, in English, Tamil and Hindi.
  - Incident page: a "Community help" section (open or stop, accept or decline offers, the helpers so far).
  - Dashboard: "🙋 N offers of help". Volunteer home: a link to the map.
- **Safety:**
  - Offers only on hazards already on the map.
  - Phones are for coordinators only; the public feed never carries names or phones.
  - Helpers never see the reporter's details.
  - One offer per phone.
  - A safety line on every help action.
- **Also fixed:** in list view the hazard card didn't open at all; it does now.
- **Database:** a `help_offers` table, plus `incidents.open_to_all` and `incidents.public_task`. Re-run `schema.sql`.
  Merges move offers; clean-up and demo reset delete them.
- **Evidence:**
  - 135 tests pass (8 new); type-check and build clean.
  - 5 deliberate breaks, all caught (one after tightening a test).
  - Offer and join clicked through in headless Chrome at phone size.
  - Dashboard and incident page now make 5 and 11 queries per refresh (was 4 and 10); `docs/scaling.md` updated.

## Speech-to-text routed by language (2026-10-01, BR-12)

- **What changed:** each voice note now goes to the engine that measured best for its language, instead of Whisper
  small for everything.
  - Tamil → AI4Bharat IndicConformer Tamil; Hindi → IndicConformer Hindi; English → NVIDIA Parakeet TDT 0.6B v3.
  - Other languages → Whisper small, which also guesses the language and takes over when an engine fails.
  - The English version of Tamil and Hindi now comes from the local AI (Qwen), translating the text staff see.
  - The app sends its language with each report as a hint (`reports.app_language`).
  - The "live text" tickbox (F24) is removed: it used the browser's Google speech service, needed internet and
    usually didn't work in the Android app. Voice notes are transcribed on the server only.
- **Language guess:** Whisper listens to the first 30 s but writes out only 1 s (about twice as fast). Its known
  mix-ups are corrected: Urdu → Hindi, Malayalam → Tamil. If it guesses something else, a Tamil or Hindi app
  language wins.
- **Measured through the real server code** on 25 real FLEURS recordings per language (`npm run eval:asr`):

  | Character errors | Before (clean) | Now (clean) | Before (loud noise, 5 dB) | Now (loud noise) |
  |---|---|---|---|---|
  | Tamil | 37.9% | **20.5%** | 62.6% | **35.5%** |
  | Hindi | 36.3% | **5.0%** | 62.8% | **10.6%** |
  | English | 8.6% | **7.9%** | 14.0% | **11.3%** |

  - Wrong language guesses: 4 → 0 (clean) and 13 → 3 (noise) with no app language. The 3 left were
    Norwegian/Sinhala guesses for noisy Tamil; with the app in Tamil they go to 0 and noisy Tamil drops to 24.9%.
  - English: Parakeet ties Whisper turbo on accuracy and is 11× faster; both beat Whisper small.
  - English version (chrF, higher is better): Hindi 43.4 → 50.4, Tamil 27.2 → 27.4 (still weak: the 3B AI's Tamil
    is the limit).
- **Setup:** `npm run setup-ai` also downloads Parakeet (4-bit, ~420 MB) and the two IndicConformer models (~335 MB),
  pinned to exact versions and checked by SHA-256. `sherpa-onnx-node` moved from a dev to a runtime dependency.
- **Found on the way:**
  - The "multi-Indic" model is really AI4Bharat's Hindi model: 107% character errors on Tamil. Renamed
    `models/indicconformer-hi`.
  - Qwen 2.5 **3B** is under the Qwen Research License (non-commercial), not Apache-2.0; README and TODO say so.
- **Evidence:**
  - 151 tests pass: 8 new routing tests with stand-in engines and 8 new rule and API tests. Type-check (now also
    `eval/asr.ts`) and build clean.
  - 11 deliberate breaks (M33–M43), all caught.
- **Database:** `reports.app_language`. **Run `schema.sql` before restarting the server**: the new code writes that
  column, so reports would fail to save without it.

## Judges' demo setup (2026-10-01)

- **Real database cleared** on the owner's request (a backup was taken first, outside the repo). New accounts: an admin and
  9 volunteers with different skills, equipment and vehicles, 0.6–7.6 km from where the test reports came from.
  Later the same day, on the owner's request, all 9 volunteers were deleted again (backup first; their one waiting
  assignment was removed and logged on its incident). Only the admin remains; volunteers now sign up through the app.
- **Short logins:** staff can log in with a username; `admin` means `admin@hopegrid.app` (`LOGIN_DOMAIN`). The login
  field accepts either. 1 new API test.
- **Demo material** next to the repo: `HopeGrid-Demo.mp4` (3:00, recorded on an in-memory copy with sample data),
  `HopeGrid-Demo-Speaker-Notes.pdf` and `HopeGrid-Tech-Stack.pdf`.
- **Fixes found while recording:** a voice note's English line now starts on its own line on the incident page;
  Whisper's `[BLANK_AUDIO]` no longer counts as a transcript (1 new test).
- **False positives and false negatives (English):** new 79-report set `eval/english.jsonl` and per-flag error rates in
  `eval/run.ts`; results in `docs/evaluation.md` §2.6 and `HopeGrid-AI-Error-Rates.pdf`. The AI never missed a trapped
  person; it missed 3 of 12 Critical reports (all still rated High) and raised 10 Critical false alarms.
- **Found, not fixed:** the 3B AI's English for Tamil voice notes can be nonsense; IndicConformer Tamil drops the first
  word after a very quiet start; the keyword rules file "collapsed" (medical) as Building collapse.

## Volunteer notifications fixed (2026-10-01, BR-167)

- **Why nothing arrived:** only auto-dispatch sent a push or SMS, never a coordinator's **Assign**. On the test phone,
  notifications for HopeGrid were turned off, so the app never registered; the one stored token was dead
  (UNREGISTERED). After the database reset no volunteer had a phone number, so there was no SMS and the WhatsApp button
  said "No phone number".
- **Now:** Assign sends the volunteer an SMS ("Reply YES CODE or NO CODE") and a push "New help request #CODE". Pushes
  use a high-importance "Help requests" channel (sound, pop-up, lock screen). An open app refreshes at once when one
  arrives. The volunteer home shows "Notifications are off" with how to fix it and a Try again button.
- 2 new tests (1 rule, 1 API); the push test checks the channel. 2 of 2 deliberate breaks caught.

## Only you can do these

- **Rotate the Supabase keys.**
- **Run `supabase/schema.sql` again** so the `volunteer_applications` table, the SMS columns (`channel`,
  `pending_media`, `completed_at`), the F28/F29 tables and columns, and `reports.app_language` exist. Do it **before**
  restarting the server on the new code.
- **Set up the SMS gateway phone** (README → "Reports by SMS") and test it with a real SMS.
- **Tell me the hackathon track** (placeholder at the top of `docs/problem.md`).
- **Check live updates through a real `npm run tunnel` link** on two phones (not tested through a live tunnel).
- **Collect real user feedback** (plan + template: `docs/impact-and-deployment.md` §6–7).
- **Record a demo video.**
- **Choose a licence.**

## Places marked "TODO: needs verification"

- `docs/problem.md` §2: how often emergency lines are overwhelmed, how long requests wait, how many are duplicates.
- `docs/comparison.md` §5: other tools' triage features, where KoboToolbox's AI runs, and what Indian authorities
  currently use.
- `docs/verification.md` §6: a run against a real Supabase project (including volunteer registration with real
  Supabase Auth), iPhone/Safari recordings, and a live Cloudflare tunnel against the reset guard.
- `docs/scaling.md`: Supabase plan limits for the computed polling load; whether Cloudflare quick tunnels pass the
  live-signal streams through unbuffered.
