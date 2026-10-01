# architecture.md — Hyperlocal HopeGrid Platform (Hackathon MVP v3)

> **Purpose of this file:** the single source of truth for HOW the system is built: stack, folders, database, API, data flow, environment, setup and build plan.
> **Companion files:** `features.md` (WHAT to build, feature IDs `F*`, screen IDs `S*`) and `rules.md` (HOW things behave `BR-*`, and how agents work `AR-*`).
> **If any two files seem to disagree: stop and ask the lead. Do not guess.**

---

## 1. Product in one paragraph

Victims report emergencies from a phone (text, voice, photo, GPS) without logging in, even while offline. The server turns each report into a structured incident using local AI (Whisper for speech, a local LLM for understanding), detects duplicates and related incidents, and scores confidence (how reliable) and priority (how urgent) with visible reasons. An admin reviews, verifies, merges, assigns a volunteer, allocates resources, escalates (simulated) and resolves. The volunteer accepts and updates progress, and can chat privately with the victim without either side seeing phone numbers. The public sees a safe hazard map.

**Principle:** AI understands and assists. Humans verify and decide. Volunteers respond. The community stays informed.

---

## 2. Roles

| Role | Login | Where |
|---|---|---|
| Victim | No login. Uses report code + PIN. | Public pages |
| Community | No login | Public map |
| Admin | Supabase Auth (email + password), role `ADMIN` | `/admin/*` |
| Volunteer | Supabase Auth (email + password), role `VOLUNTEER` | `/volunteer/*` |

Admin accounts are created by the seed script or by hand (Supabase Auth user + `profiles` row). Volunteers can also register themselves at `/volunteer/register` (F26): the login is created at once but only works after an admin approves the application, which creates the `profiles` row (BR-150). There are no victim accounts.

---

## 3. System architecture

```text
┌──────────────────────────── React PWA (one app) ────────────────────────────┐
│ Pages/components                                                             │
│      │ (only through)                                                        │
│ src/data/index.ts  ──►  realApi.ts (fetch /api/*)                            │
│ src/offline/outbox.ts (IndexedDB) → sends queued reports when online         │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ HTTPS (cloudflared/ngrok tunnel to laptop)
┌───────────────────────────────▼──────────────── Express server (laptop) ─────┐
│ routes → shared rules (/shared) → Supabase client (service role)             │
│ pipeline.ts: transcribe (speech) → structure (local LLM | keywords) → incident  │
│              → duplicate check → scores                                      │
│ Serves built frontend (dist/) in demo mode                                   │
└───────┬───────────────────────┬──────────────────────────┬───────────────────┘
        │                       │                          │
   Supabase (cloud)        LLM (in-process)          speech + ffmpeg (in-process)
   - Postgres tables       - Qwen2.5 3B GGUF         - whisper.cpp ggml-small
                           - also translates         - Parakeet (English)
                             Tamil/Hindi speech      - IndicConformer ta + hi
                                                       (sherpa-onnx)
   - Storage bucket "media" (private)
   - Auth (staff only)
```

### 3.1 Architecture decisions (final — do not change without lead approval)

| # | Decision | Reason |
|---|---|---|
| D1 | One repo, one `package.json`. Folders: `src/` (frontend), `server/` (backend), `shared/` (plain TS imported by both). | Simplest setup; shared types and rules keep frontend and server behaving identically. |
| D2 | React + Vite + TypeScript + Tailwind + React Router. | Fast, familiar. |
| D3 | `vite-plugin-pwa` for app-shell offline only. No custom service worker logic. | The app must open offline; reports are queued by app code, not by the service worker. |
| D4 | `idb-keyval` for the offline outbox and device ID. | Can store large base64 media; localStorage is too small. |
| D5 | Express server is the **only** component that talks to Supabase. The frontend never imports `@supabase/supabase-js`. | One boundary; secrets stay on server. |
| D6 | Supabase Postgres with RLS **enabled on every table and no policies**. Server uses the service-role key. | Secure by default with zero policy work. |
| D7 | Supabase Storage bucket `media`, **private**. Server returns signed URLs (1 hour) only to allowed users. | Victim photos/voice never public. |
| D8 | Supabase Auth for staff login, called by the server (`/api/auth/login`). Server verifies bearer token on each request. | Real auth with no custom password handling. |
| D9 | Report processing runs inside the server process after responding (not awaited). On server start, all `PENDING` reports are processed. | No queue infrastructure; nothing lost on restart. |
| D10 | Local LLM inside the server via `node-llama-cpp` (Qwen2.5 3B Instruct, GGUF Q4_K_M) with JSON-schema grammar, temperature 0. Fallback: keyword extractor in `shared/`. | "Local AI"; demo never stalls. |
| D11 | Speech inside the server, routed by language (BR-12, 2026-10-01): whisper.cpp via `@fugood/whisper.node` guesses the language and hears other languages (and is the fallback); NVIDIA Parakeet TDT 0.6B v3 (CC-BY-4.0, same package) hears English; AI4Bharat IndicConformer (MIT; NeMo CTC, int8) via `sherpa-onnx-node` hears Tamil and Hindi; the local LLM writes the English version. ffmpeg from `@ffmpeg-installer/ffmpeg`. Models download into `models/` only with `npm run setup-ai` (server laptop), pinned and checksum-checked; without them the server falls back per BR-11/BR-12. | Local and offline. On real recordings IndicConformer made about half (Tamil) and a seventh (Hindi) of Whisper small's character errors, and Parakeet fewer than Whisper small for English (as few as Whisper turbo, at a tenth of its time; docs/evaluation.md §5b); Whisper alone was weak for Tamil. |
| D12 | Polling, plus Server-Sent Events **change signals** (2026-09-29). Staff and victim screens open one stream (`/api/admin/events`, `/api/volunteer/events`, `POST /api/track/events`) that only says which incident changed (victims: that *their* report changed, with no ids). The screen then refetches through its normal API call, at most once per its polling interval. While the stream is live it polls only every `POLL_FALLBACK_MS`; without it, it polls as before. Intervals in `shared/constants.ts`. | Updates appear at once and idle polling drops ~6×. No data or new privacy surface on the stream, and still works when streams don't (proxies, errors). |
| D13 | Leaflet + OpenStreetMap tiles; list view fallback. | Free, no API key. |
| D14 | Media and all request bodies are JSON with base64 media (no multipart). | One code path for online and offline (outbox stores JSON). |
| D15 | DB columns are `snake_case`; API JSON and TS are `camelCase`. Conversion only in `server/mappers.ts`. | No naming ambiguity. |
| D16 | MVP: at most **one active assignment per incident** and per volunteer. | Unambiguous chat routing and reassignment. |

---

## 4. Tech stack and allowed libraries

**Frontend:** react, react-dom, react-router-dom, vite, @vitejs/plugin-react, vite-plugin-pwa, tailwindcss, @tailwindcss/vite, leaflet, react-leaflet, idb-keyval.
**Backend:** express, @supabase/supabase-js, tsx (run TS), dotenv, node-llama-cpp, @fugood/whisper.node, sherpa-onnx-node, @ffmpeg-installer/ffmpeg.
**Tooling:** typescript, concurrently, vitest.
**Tunnel:** cloudflared (npm package, `npm run tunnel`). Nothing else is installed outside npm; Node.js 22.12+ is the only prerequisite.

No other library may be added without lead approval (see `rules.md` AR-06).

---

## 5. Folder and file structure

Every file that should exist is listed. Do not create other files without approval.

```text
hopegrid/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .env.example
├── .gitignore
├── README.md
├── CHANGES.md                    (log of the 2026-09-29 score-raising pass)
├── docs/
│   ├── architecture.md
│   ├── features.md
│   ├── rules.md
│   ├── problem.md · comparison.md · impact-and-deployment.md   (context, sourced)
│   └── verification.md · evaluation.md · scaling.md              (evidence, measured)
├── eval/                         (synthetic labelled data + evaluation scripts; results/ is gitignored)
│   ├── README.md · reports.jsonl · heldout.jsonl · duplicate-pairs.jsonl
│   └── run.ts · score.ts · bench.ts · prompt-experiment.ts · diagnose-type-bias.ts
├── supabase/
│   └── schema.sql
├── models/                       (gitignored; AI + speech model files, downloaded by npm run setup-ai)
├── shared/
│   ├── types.ts
│   ├── constants.ts
│   ├── keywordExtractor.ts
│   ├── scoring.ts
│   ├── linking.ts
│   ├── volunteerMatch.ts
│   ├── publicView.ts
│   ├── trackingStatus.ts
│   ├── sms.ts                    (F27 SMS format)
│   ├── dispatch.ts               (F28 auto-dispatch rules)
│   ├── communityHelp.ts          (F29 offers, join, take)
│   └── speech.ts                 (BR-12 which speech engine)
├── server/
│   ├── index.ts
│   ├── supabase.ts
│   ├── auth.ts
│   ├── mappers.ts
│   ├── storage.ts
│   ├── ai.ts
│   ├── transcribe.ts             (speech: IndicConformer, Parakeet, Whisper)
│   ├── sherpa-onnx-node.d.ts     (types for the IndicConformer runtime)
│   ├── pipeline.ts
│   ├── events.ts                 (live change signals, D12)
│   ├── dispatch.ts               (F28 auto-dispatch + shared assignment steps)
│   ├── push.ts                   (F28 Firebase push, FCM HTTP v1)
│   ├── smsGateway.ts             (sends SMS through the gateway phone)
│   ├── routes/
│   │   ├── victim.ts
│   │   ├── public.ts
│   │   ├── authRoutes.ts
│   │   ├── applications.ts       (F26 volunteer registration, public)
│   │   ├── admin.ts
│   │   ├── volunteer.ts
│   │   ├── messages.ts
│   │   ├── sms.ts                (F27 reports by SMS, from the gateway phone)
│   │   └── dev.ts
│   └── scripts/
│       ├── seed.ts
│       ├── setup-models.ts       (npm run setup-ai)
│       ├── cleanup.ts            (retention: dry run unless --apply)
│       └── sms-connect.ts        (npm run sms:connect: points the gateway phone at this server)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── data/
│   │   ├── index.ts
│   │   └── realApi.ts
│   ├── offline/
│   │   ├── outbox.ts
│   │   ├── deviceId.ts
│   │   └── useOnline.ts
│   ├── hooks/
│   │   ├── usePoll.ts
│   │   └── useAuth.tsx
│   ├── i18n/                     (F25: en.ts, ta.ts, hi.ts, index.tsx)
│   ├── lib/
│   │   ├── codes.ts
│   │   ├── media.ts
│   │   ├── geo.ts
│   │   ├── labels.ts
│   │   ├── sms.ts                (F27: gateway number, sms: link)
│   │   └── push.ts               (F28: SOS notifications in the Android app)
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── Badges.tsx
│   │   ├── ReasonList.tsx
│   │   ├── Modal.tsx
│   │   ├── SafetyMap.tsx
│   │   ├── VoiceRecorder.tsx
│   │   └── ChatBox.tsx
│   └── pages/
│       ├── Home.tsx
│       ├── Report.tsx
│       ├── ReportSent.tsx
│       ├── Track.tsx
│       ├── PublicMap.tsx
│       ├── Login.tsx
│       ├── VolunteerRegister.tsx (F26)
│       ├── NotFound.tsx
│       ├── admin/
│       │   ├── Dashboard.tsx
│       │   ├── IncidentPage.tsx
│       │   ├── Resources.tsx
│       │   └── Volunteers.tsx    (F26 applications + volunteer list)
│       └── volunteer/
│           ├── VolunteerHome.tsx
│           └── AssignmentPage.tsx
└── tests/
    ├── rules.test.ts
    └── integration/              (API tests: real routers + pipeline, Supabase/LLM/Whisper replaced)
        ├── api.test.ts
        ├── fakeSupabase.ts       (in-memory tables built from supabase/schema.sql)
        ├── stubs.ts              (LLM and Whisper stand-ins)
        └── testApp.ts            (routers wired like server/index.ts)
```

### 5.1 File responsibilities

**Root**

| File | Responsibility |
|---|---|
| package.json | Scripts: `dev` (vite + server via concurrently), `build` (vite build), `start` (server serving dist), `seed` (server/scripts/seed.ts), `test` (vitest), `setup-ai`, `tunnel`, `eval` / `bench` (eval/), `cleanup` (server/scripts/cleanup.ts). |
| vite.config.ts | React, Tailwind, PWA plugin (manifest name "HopeGrid", app-shell precache), dev proxy `/api` → `http://localhost:3000`. |
| .env.example | All variables in §9. |
| .gitignore | node_modules, dist, .env, models/*, tmp/ |
| README.md | Setup steps (§10), demo accounts, how to run demo. |
| supabase/schema.sql | Creates all tables in §6, enables RLS on each, creates storage bucket `media` (private). Run once in Supabase SQL editor. |

**shared/** (pure TypeScript; no imports from `src/` or `server/`; no network, no DB)

| File | Responsibility | Rules |
|---|---|---|
| types.ts | All enums and API types (§7, §8). The only place types are defined. | — |
| constants.ts | Thresholds, weights, polling intervals, limits, code alphabet, emergency number default. | All numbers used by rules live here. |
| keywordExtractor.ts | Text → `Extraction` without AI (offline preview + server fallback). | BR-10 |
| scoring.ts | `computeConfidence`, `computePriority`, `effectivePriority`, `computeEscalation`. | BR-20…BR-32 |
| linking.ts | `findDuplicate`, `findRelated`, `mergeFields`, `laterFacts`. | BR-40…BR-52, BR-07 |
| volunteerMatch.ts | `rankVolunteers`. | BR-60…BR-63 |
| publicView.ts | `isPublic`, `toPublicIncident`, `adviceFor`, `markerColor`. | BR-80…BR-84 |
| trackingStatus.ts | `victimStep` (internal state → victim step). | BR-90 |
| sms.ts | `encodeSmsReport` (phone) and `parseSmsReport` (server): the one-SMS report format. | BR-06 |
| communityHelp.ts | `checkHelpOffer`, `checkPublicTask`, `helpOptions` (who may take, offer or join). | BR-170…BR-172 |
| speech.ts | `speechLanguage` (Whisper's guess + the app's language → language), `speechEngine`, `isSpeechLang`, `cleanTranslation`. | BR-12 |
| dispatch.ts | `checkDispatchSettings`, `waitingIncidents`, `incidentsToDispatch`, `expiredOffers`, `parseVolunteerReply`, `sosSummary`/`sosSms`/`sosPush`. | BR-160…BR-164 |

**server/**

| File | Responsibility |
|---|---|
| index.ts | Express app: JSON body limit 15 MB, mounts routes under `/api`, error handler (envelope §8.1), serves `dist/` + SPA fallback, on start runs `processPendingReports()`. Port from env. |
| supabase.ts | Creates two clients: `db` (service role, for all data + storage) and `authClient` (anon key, for `signInWithPassword`). |
| auth.ts | Middleware `requireRole(role)`: reads `Authorization: Bearer <token>`, `db.auth.getUser(token)`, loads `profiles` row, attaches `req.user = {id, name, role}`; 401/403 otherwise. |
| mappers.ts | DB row ↔ API object conversion (snake_case ↔ camelCase). Only place this happens. |
| storage.ts | `uploadBase64(path, base64, mime)`, `signedUrl(path)` (1 hour). |
| ai.ts | `structureText(text): Promise<{extraction, source}>` — local LLM call (node-llama-cpp) (timeout 30 s, JSON schema of `Extraction`), validate/coerce (BR-11), on any failure use `keywordExtractor` and `source = KEYWORDS`. `translateToEnglish(text, 'ta' \| 'hi')` — English version of a voice-note transcript on its own small context (BR-12). |
| transcribe.ts | `transcribe(storagePath, appLanguage): Promise<{text, language, english, engine}>` — download audio, ffmpeg → 16 kHz mono PCM; Whisper guesses the language; Tamil and Hindi go to IndicConformer, English to Parakeet, the rest to Whisper told the language (Whisper also takes over when an engine fails); non-English speech also gets an English version (`ai.translateToEnglish`, else Whisper's translate pass) (BR-12). One voice note at a time. Timeout 60 s. Throws on failure. `loadSpeechModels()` warms every installed model at start. |
| pipeline.ts | `processReport(reportId)`, `recomputeIncident(incidentId)`, `processPendingReports()`, `changeReport(id, change)` (BR-07: change a stored report only while it is not being processed, then queue it again), `checkSchema()` (startup warning when schema.sql needs re-running). Implements §11.2. |
| routes/victim.ts | `/api/reports` (also completes a report that came by SMS, BR-07), `/api/track`, `/api/track/verify-phone`. |
| dispatch.ts | F28: dispatch settings; `createAssignment` and `applyVolunteerStatus` (BR-100…BR-104, used by coordinators, volunteers and SMS answers); `answerBySms` (BR-163); `runDispatch` (expire deadlines, send SOS offers) and `startDispatcher` (every DISPATCH_TICK_MS). |
| push.ts | F28: `sendPush(token, …)` via FCM HTTP v1, signing the Google token from FIREBASE_SERVICE_ACCOUNT with node:crypto. Off without it. |
| smsGateway.ts | `sendSms(to, text)` through the gateway phone's Local Server API (F27 replies, F28 SOS). |
| routes/sms.ts | `POST /api/sms/incoming` (F27, BR-06; volunteers' YES/NO answers first, BR-163): checks the gateway's signature or bearer secret, turns packed or plain-word SMS into reports, adds follow-ups, replies through the gateway. Mounted before the JSON parser (the signature covers the raw body). |
| routes/public.ts | `/api/public/incidents`. |
| events.ts | In-process change signals: `emitChange({incidentId, reportId?, volunteerId?})` (called on every incident update, log, report link/finish, chat message and assignment), merged per `STREAM_COALESCE_MS`; `openStream(res, pick)` writes a Server-Sent Events stream with a ping every `STREAM_PING_MS`. |
| routes/authRoutes.ts | `/api/auth/login`, `/api/auth/me`. Login without a profile row → 401; the message says "waiting for approval" when a PENDING volunteer application exists (BR-150). |
| routes/applications.ts | `POST /api/volunteer-applications` (public): validates, creates the Supabase Auth login, stores the ID proof, inserts the application; undoes the login and proof if a later step fails (BR-150). |
| routes/admin.ts | All `/api/admin/*` routes, including application review (approve → profile row; reject → login and proof deleted) and the volunteer list. |
| routes/volunteer.ts | `/api/volunteer/*` except chat. |
| routes/messages.ts | Victim chat (`/api/track/chat*`) and volunteer chat (`/api/volunteer/assignments/:id/chat`). |
| routes/dev.ts | `/api/dev/reset` — only mounted when `DEV_MODE=true`, and only answers requests made on the server laptop itself (loopback, no forwarding headers, `Host: localhost`). |
| scripts/seed.ts | Deletes all rows + storage objects, creates staff auth users if missing, inserts seed data (§12). Also used by `/api/dev/reset`. |
| scripts/cleanup.ts | Retention: deletes closed incidents (RESOLVED/REJECTED/MERGED) not updated for N days with all their rows and media, in foreign-key order. Dry run unless `--apply`. |

**src/** (frontend)

| File | Responsibility |
|---|---|
| main.tsx | Render app, register PWA, call `outbox.start()`. |
| App.tsx | All routes (§5.2). Only the lead edits route definitions. |
| data/index.ts | Exports `api: Api` = realApi. Defines the `Api` interface (§8.3). |
| data/realApi.ts | Implements `Api` with fetch to `/api/*`, attaches bearer token from `useAuth` storage. |
| offline/outbox.ts | Queue, send, retry reports (BR-02). `start()`, `enqueue()`, `list()`, `retryAll()`, `remove(id)`, `subscribe(fn)`. |
| offline/deviceId.ts | `getDeviceId()` — UUID created on first use, stored in IndexedDB. |
| offline/useOnline.ts | `navigator.onLine` + events. |
| hooks/usePoll.ts | `usePoll(fn, intervalMs, deps?, enabled?, watch?)` → `{data, error, loading, refresh}`. With `watch` (a live change signal): refresh on a signal (at most once per `intervalMs`); poll only every `POLL_FALLBACK_MS` while the stream is live. |
| hooks/useAuth.tsx | Auth context: `{user, token, login, logout}`; token in sessionStorage. |
| i18n/index.tsx | F25: `LanguageProvider`, `useI18n()` → `{t, rich, server, ago, type, need, advice…}`, `LanguagePicker`, `EnglishOnly` (staff screens). Keys in `en.ts`; `ta.ts`/`hi.ts` must cover every key (type-checked). |
| lib/codes.ts | `newReportCode()`, `newPin()`, `newUuid()` using `crypto`. |
| lib/media.ts | `compressImage(file) → base64 jpeg` (max 1280 px, quality 0.7); `blobToBase64`. |
| lib/geo.ts | `getPosition()` with 10 s timeout; `distanceMeters()` (re-export of shared if needed). |
| lib/labels.ts | Enum → display text, colors, icons. |
| lib/sms.ts | F27: `SMS_NUMBER` (from `VITE_SMS_NUMBER`), `smsHref(number, body)`. |
| lib/push.ts | F28: `startPush(save, onOpen)` with @capacitor/push-notifications, only in app builds with `VITE_PUSH_ENABLED`. |
| components/Layout.tsx | Header, nav per role, offline banner, emergency number banner on public pages. |
| components/Badges.tsx | PriorityBadge, ConfidenceBadge, StatusBadge. |
| components/ReasonList.tsx | Renders `Reason[]` ("+20 · 2 independent reports"). |
| components/Modal.tsx | Generic modal. |
| components/SafetyMap.tsx | Leaflet map with colored markers; `onTileError` → list mode. |
| components/VoiceRecorder.tsx | Record (MediaRecorder), stop at 60 s, play, delete; returns `{base64, mime, seconds}`. |
| components/ChatBox.tsx | Message list, text input, quick replies, voice message, share-location button; used by victim, volunteer, admin (read-only prop). |
| pages/* | One screen each (see `features.md` §S). Pages hold no business logic and no fetch calls. |
| tests/rules.test.ts | Unit tests for all `shared/` functions. |
| tests/integration/* | API tests through real HTTP against the real routers and pipeline; Supabase is an in-memory fake that enforces `schema.sql` constraints; LLM and Whisper are stubbed (AR-31). |

### 5.2 Routes (frontend)

| Path | Page | Access |
|---|---|---|
| `/` | Home | Public |
| `/report` | Report | Public |
| `/report/sent/:id` | ReportSent (`:id` = report UUID in outbox) | Public |
| `/track` | Track (optional query `?r=<reportId>` to auto-fill code/PIN from outbox) | Public |
| `/map` | PublicMap | Public |
| `/login` | Login | Public |
| `/admin` | admin/Dashboard | ADMIN |
| `/admin/incidents/:id` | admin/IncidentPage | ADMIN |
| `/admin/resources` | admin/Resources | ADMIN |
| `/admin/volunteers` | admin/Volunteers | ADMIN |
| `/volunteer/register` | VolunteerRegister | Public (declared before `/volunteer`) |
| `/volunteer` | volunteer/VolunteerHome | VOLUNTEER |
| `/volunteer/assignments/:id` | volunteer/AssignmentPage | VOLUNTEER |
| `*` | NotFound | — |

Unauthenticated access to a protected route → redirect to `/login`. Wrong role → redirect to that user's home.

---

## 6. Database (Supabase Postgres)

Conventions: `id uuid primary key default gen_random_uuid()` unless stated; `created_at timestamptz default now()`; text enums stored as `text` (values from `shared/types.ts`); arrays as `text[]`; reason lists as `jsonb`. RLS enabled on every table, **no policies**.

### 6.1 `profiles` (staff; one row per Supabase auth user that may log in)

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid PK | no | = `auth.users.id` |
| name | text | no | |
| email | text | no | |
| role | text | no | `ADMIN` \| `VOLUNTEER` |
| phone | text | yes | never sent to victims |
| skills | text[] | no | `Skill[]`, empty for admin |
| equipment | text[] | no | `Equipment[]` |
| vehicle | text | no | `Vehicle`, default `NONE` |
| availability | text | no | `Availability`, default `AVAILABLE` |
| lat, lng | double precision | yes | volunteer base location |
| created_at | timestamptz | no | |

### 6.2 `incidents`

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid PK | no | |
| code | text unique | no | 5 chars from code alphabet (BR-01) |
| type | text | no | `IncidentType` |
| lat, lng | double precision | yes | |
| location_text | text | yes | admin-visible |
| public_area | text | yes | shown publicly only when verified (BR-81) |
| people | int | yes | null = unknown |
| vulnerable, trapped, medical, danger | boolean | no | default false |
| needs | text[] | no | `Need[]` |
| summary | text | yes | |
| status | text | no | `IncidentStatus`, default `NEW` |
| confidence | int | no | 0–99 |
| confidence_reasons | jsonb | no | `Reason[]` |
| priority_score | int | no | |
| priority | text | no | computed `PriorityLevel` |
| priority_reasons | jsonb | no | `Reason[]` |
| priority_override | text | yes | `PriorityLevel` |
| override_reason | text | yes | required when override set |
| escalation_recommended | boolean | no | |
| escalation_reasons | jsonb | no | `Reason[]` |
| escalated_at | timestamptz | yes | |
| verified_at | timestamptz | yes | set by verify |
| on_site_at | timestamptz | yes | first volunteer ON_SITE |
| resolved_at | timestamptz | yes | |
| reject_reason | text | yes | |
| possible_duplicate_of | uuid FK → incidents | yes | |
| merged_into | uuid FK → incidents | yes | |
| created_at, updated_at | timestamptz | no | |

### 6.3 `reports`

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid PK | no | **generated on the phone** (idempotency key) |
| code | text unique | no | 6 chars (victim tracking code) |
| pin | text | no | 4 digits (plain text; MVP) |
| device_id | text | no | |
| incident_id | uuid FK → incidents | yes | null until processed |
| text | text | no | may be empty string when voice-only |
| transcript | text | yes | |
| transcript_status | text | no | `NONE` \| `DONE` \| `FAILED` |
| lat, lng | double precision | yes | |
| location_text | text | yes | |
| people | int | yes | victim-entered |
| needs | text[] | no | victim-entered |
| phone | text | yes | |
| phone_verified | boolean | no | default false |
| photo_path | text | yes | storage path |
| audio_path | text | yes | storage path |
| audio_seconds | int | yes | |
| extraction | jsonb | yes | `Extraction` |
| ai_source | text | yes | `AI` \| `KEYWORDS` |
| processing_status | text | no | `PENDING` \| `DONE` \| `FAILED` |
| channel | text | no | `APP` \| `SMS` (F27), default APP |
| pending_media | text[] | no | SMS reports: `PHOTO` / `AUDIO` still on the phone (BR-07) |
| completed_at | timestamptz | yes | SMS reports: when the phone's full upload arrived (BR-07) |
| app_language | text | yes | `en` \| `ta` \| `hi`: the app's language, a hint for speech recognition (BR-12) |

F29 adds: `incidents.open_to_all` (boolean, default false) and `incidents.public_task` (text, shown publicly), and a
`help_offers` table (`incident_id` FK, `name`, `phone` (coordinators only), `kinds` text[], `note`, `status`
PENDING | ACCEPTED | DECLINED | JOINED, `device_id`, `created_at`, `reviewed_at`).

F28 adds: `assignments.auto` (boolean, default false) and `assignments.respond_by` (timestamptz), `incidents.auto_dispatched_at`
(timestamptz), `profiles.push_token` (text), and a `settings` table (`key` text PK, `value` jsonb, `updated_at`) holding
the dispatch settings under key `dispatch`.
| created_at | timestamptz | no | time on the phone (SMS: time received) |
| received_at | timestamptz | no | server time, default now() |

### 6.4 `assignments`

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid PK | no | |
| incident_id | uuid FK | no | |
| volunteer_id | uuid FK → profiles | no | |
| status | text | no | `AssignmentStatus` |
| reason | text | yes | `UnableReason` or free text |
| created_at, updated_at | timestamptz | no | |

### 6.5 `messages` (private chat)

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid PK | no | |
| incident_id | uuid FK | no | |
| report_id | uuid FK → reports | no | identifies which victim thread |
| assignment_id | uuid FK → assignments | no | identifies which volunteer |
| sender | text | no | `VICTIM` \| `VOLUNTEER` |
| text | text | yes | |
| audio_path | text | yes | |
| lat, lng | double precision | yes | set by "share my location" |
| created_at | timestamptz | no | |

### 6.6 `resources`, `allocations`, `incident_logs`

`resources`: id, name text, category text (`ResourceCategory`), quantity int (available now, ≥ 0), unit text, location_text text, created_at.
`allocations`: id, resource_id FK, incident_id FK, quantity int (> 0), created_at.
`incident_logs`: id, incident_id FK, text text, public boolean (shown to victim on Track page), created_at.

### 6.7 Storage

Bucket `media` (private). Paths:
- `reports/{reportId}/photo.jpg`
- `reports/{reportId}/audio.{webm|mp4|ogg}`
- `messages/{messageId}.{webm|mp4|ogg}`
- `applications/{applicationId}/proof.jpg` (volunteer ID proof, F26; admins only; deleted on rejection)

### 6.8 `volunteer_applications` (F26, BR-150)

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid PK | no | |
| user_id | uuid | no | the Supabase Auth user created on apply; becomes `profiles.id` on approval |
| name, email, phone | text | no | |
| skills | text[] | no | `Skill[]`, at least one |
| equipment | text[] | no | `Equipment[]`, may be empty |
| vehicle | text | no | `Vehicle`, default `NONE` |
| lat, lng | double precision | yes | optional base location |
| location_text | text | yes | area typed by the applicant |
| proof_path | text | yes | storage path of the ID photo; null after rejection |
| status | text | no | `PENDING` \| `APPROVED` \| `REJECTED`, default `PENDING` (index) |
| reject_reason | text | yes | |
| reviewed_by | uuid | yes | admin profile id |
| reviewed_at | timestamptz | yes | |
| created_at | timestamptz | no | |

No password column: Supabase Auth holds it.

---

## 7. Shared types (contract — defined in `shared/types.ts`)

```text
IncidentType     = FLOOD | CYCLONE | HEAVY_RAIN | FIRE | BUILDING_COLLAPSE | LANDSLIDE
                 | ROAD_BLOCKED | POWER_OUTAGE | PEOPLE_TRAPPED | MEDICAL | OTHER
SITUATION_TYPES  = [PEOPLE_TRAPPED, MEDICAL, OTHER]
HAZARD_TYPES     = all other IncidentType values
Need             = EVACUATION | RESCUE | MEDICAL | PHYSICAL_HELP | FOOD_WATER | SHELTER | OTHER
IncidentStatus   = NEW | VERIFIED | IN_PROGRESS | RESOLVED | REJECTED | MERGED
ACTIVE_STATUSES  = [NEW, VERIFIED, IN_PROGRESS]
PriorityLevel    = LOW | MEDIUM | HIGH | CRITICAL
ConfidenceBand   = LOW | MEDIUM | HIGH
Role             = ADMIN | VOLUNTEER
Skill            = FIRST_AID | MEDICAL_PRO | SWIMMING | BOAT_HANDLING | SEARCH_RESCUE
                 | FIREFIGHTING | DRIVING | GENERAL
Equipment        = MEDICAL_KIT | LIFE_JACKET | BOAT | ROPE | TORCH | FIRE_EXTINGUISHER
Vehicle          = NONE | BIKE | MOTORCYCLE | CAR | TRUCK | BOAT
Availability     = AVAILABLE | BUSY | OFFLINE
AssignmentStatus = ASSIGNED | ACCEPTED | DECLINED | EN_ROUTE | ON_SITE | ASSISTING
                 | DONE | UNABLE | CANCELLED
ACTIVE_ASSIGNMENT = [ASSIGNED, ACCEPTED, EN_ROUTE, ON_SITE, ASSISTING]
CHAT_OPEN_ASSIGNMENT = [ACCEPTED, EN_ROUTE, ON_SITE, ASSISTING]
UnableReason     = NO_ACCESS | MISSING_EQUIPMENT | UNSAFE | PERSONAL | TOO_FAR | OTHER
ResourceCategory = WATER | FOOD | MEDICINE | BLANKET | GENERATOR | VEHICLE | BOAT | SHELTER | OTHER
VictimStep       = RECEIVED | REVIEWING | VERIFIED | HELP_ASSIGNED | ON_THE_WAY | ARRIVED
                 | RESOLVED | CLOSED
MarkerColor      = RED | ORANGE | YELLOW | GREEN
PublicStatus     = ACTIVE | RESPONDING | RESOLVED

Reason     = { label: string, points: number }        // points may be 0 for info lines
Extraction = { type: IncidentType, people: number|null, vulnerable: boolean,
               mobilityIssue: boolean, trapped: boolean, medical: boolean,
               danger: boolean, needs: Need[], places: string[], summary: string }
```

---

## 8. API contract

All routes are prefixed `/api`. JSON in, JSON out. Media is base64 (no data-URL prefix) plus a mime string. Admin/volunteer routes require header `Authorization: Bearer <token>`.

### 8.1 Errors

Body: `{ "error": { "code": ErrorCode, "message": string } }`

| code | HTTP | When |
|---|---|---|
| VALIDATION | 400 | Missing/invalid fields |
| UNAUTHORIZED | 401 | No/invalid token, wrong code/PIN on victim routes |
| FORBIDDEN | 403 | Wrong role or not your assignment |
| NOT_FOUND | 404 | Unknown id |
| CODE_TAKEN | 409 | Report code already used by a different report id |
| INVALID_STATE | 409 | Action not allowed in current status (see rules.md state tables) |
| CHAT_CLOSED | 409 | Chat not open (BR-72) |
| INSUFFICIENT_QUANTITY | 409 | Allocation larger than available |
| SERVER_ERROR | 500 | Anything else |

### 8.2 Endpoints

**Victim (no login)**

| Method | Path | Request | Response |
|---|---|---|---|
| POST | /reports | `ReportSubmission` | 201 `{ok:true, code}`; 200 same body if `id` already exists, or when it completes the SMS report with the same code and PIN (BR-07); 409 CODE_TAKEN |
| POST | /track | `{code, pin}` | `TrackView` |
| POST | /track/verify-phone | `{code, pin, phone, otp}` | `{ok:true}`; 400 if otp ≠ `123456` |
| POST | /track/chat | `{code, pin}` | `{open: boolean, messages: ChatMessage[]}` |
| POST | /track/chat/send | `{code, pin, text?, audioBase64?, audioMime?, lat?, lng?}` | `ChatMessage`; 409 CHAT_CLOSED |
| POST | /track/events | `{code, pin}` | `text/event-stream`: `event: change` / `data: {}` when this report or its incident changes (no ids); 401 for a wrong code/PIN |

```text
ReportSubmission = { id: uuid, code: string, pin: string, deviceId: string,
  text: string, lat: number|null, lng: number|null, locationText: string|null,
  people: number|null, needs: Need[], phone: string|null,
  photoBase64: string|null, audioBase64: string|null, audioMime: string|null,
  audioSeconds: number|null, language?: 'en'|'ta'|'hi'|null, createdAt: ISOString }

TrackView = { code, step: VictimStep, updatedAt, messages: {at, text}[],   // public logs
  phoneVerified: boolean, chatOpen: boolean }
```

**SMS gateway** (F27, BR-06; not for browsers)

| Method | Path | Request | Response |
|---|---|---|---|
| POST | /sms/incoming | SMS Gateway for Android webhook `{event: "sms:received", payload: {message, sender, messageId, receivedAt}}` signed with `X-Signature` + `X-Timestamp`, or `{from, text}` with `Authorization: Bearer <SMS_WEBHOOK_SECRET>` | `{ok:true, outcome: SmsOutcome, code?}` (CREATED \| ADDED \| ALREADY_RECEIVED \| IGNORED); 401 wrong signature/secret; 404 while `SMS_WEBHOOK_SECRET` is empty; 500 (retry) while the report is being processed |

**Community help** (F29)

| Method | Path | Request | Response |
|---|---|---|---|
| POST | /public/incidents/:code/help | `HelpOfferInput` `{name, phone, kinds, note, deviceId}` (no login) | 201/200 `{ok, status: PENDING \| JOINED, task}`; 404 not on the map; 409 a volunteer has it / resolved |
| POST | /volunteer/incidents/:code/take | — | `VolunteerAssignment` (ACCEPTED); 404 / 409 |
| POST | /admin/incidents/:id/open | `{open, task?}` | `IncidentDetail`; 409 not on the map; 400 task |
| POST | /admin/help-offers/:id/accept · /decline | — | `IncidentDetail`; 409 already answered |

`PublicIncident` also carries `helpArranged`, `openToAll`, `task`; `IncidentListItem` `pendingHelpOffers`;
`IncidentDetail` `openToAll`, `publicTask`, `helpOffers[]`.

**Auto-dispatch** (F28)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | /admin/dispatch | — | `DispatchState` `{settings: {mode, threshold, responseMinutes}, waiting, pendingOffers}` |
| PUT | /admin/dispatch | `DispatchSettings` | `DispatchState`; 400 VALIDATION (BR-160) |
| POST | /volunteer/push-token | `{token: string \| null}` | `{ok:true}` |

`VolunteerAssignment` and `IncidentDetail.assignments[]` also carry `auto` and `respondBy`.

**Public**

| GET | /public/incidents | — | `{generatedAt, incidents: PublicIncident[]}` |
|---|---|---|---|

```text
PublicIncident = { code, type, color: MarkerColor, area: string|null,
  lat: number, lng: number,            // rounded to 3 decimals
  priority: PriorityLevel, confidenceBand: ConfidenceBand, verified: boolean,
  reportCount: number, status: PublicStatus, advice: string, updatedAt }
```

**Volunteer registration (no login)**

| Method | Path | Request | Response |
|---|---|---|---|
| POST | /volunteer-applications | `VolunteerApplicationInput` = `{name, email, phone, password, skills, equipment, vehicle, lat, lng, locationText, proofBase64}` | 201 `{ok:true}`; 400 VALIDATION (incl. "An account with this email already exists.") |

**Auth**

| Method | Path | Request | Response |
|---|---|---|---|
| POST | /auth/login | `{email, password}` | `{token, user: {id, name, role}}`; 401 (a PENDING volunteer applicant gets "waiting for a coordinator to approve") |
| GET | /auth/me | — | `{user}` |

**Admin (role ADMIN)**

| Method | Path | Request | Response |
|---|---|---|---|
| GET | /admin/events | — | `text/event-stream`: `event: change` / `data: {incidentId}` for every incident that changes |
| GET | /admin/incidents | — | `{counts: {CRITICAL, HIGH, MEDIUM, LOW}, incidents: IncidentListItem[]}` |
| GET | /admin/incidents/:id | — | `IncidentDetail` |
| PATCH | /admin/incidents/:id | partial `{type, people, vulnerable, trapped, medical, danger, needs, lat, lng, locationText, publicArea, summary}` | `IncidentDetail` |
| POST | /admin/incidents/:id/verify | `{publicArea?: string}` | `IncidentDetail` |
| POST | /admin/incidents/:id/reject | `{reason: string}` | `IncidentDetail` |
| POST | /admin/incidents/:id/override | `{level: PriorityLevel\|null, reason?: string}` | `IncidentDetail` |
| POST | /admin/incidents/:id/escalate | `{note?: string}` | `IncidentDetail` |
| POST | /admin/incidents/:id/resolve | `{note?: string}` | `IncidentDetail` |
| POST | /admin/incidents/:id/merge | `{intoId: uuid}` | `IncidentDetail` (of target) |
| POST | /admin/incidents/:id/dismiss-duplicate | — | `IncidentDetail` |
| POST | /admin/incidents/:id/assign | `{volunteerId}` | `IncidentDetail` |
| POST | /admin/assignments/:id/cancel | — | `IncidentDetail` |
| POST | /admin/incidents/:id/allocate | `{resourceId, quantity}` | `IncidentDetail` |
| GET | /admin/resources | — | `Resource[]` |
| POST | /admin/resources | `{name, category, quantity, unit, locationText}` | `Resource` |
| PATCH | /admin/resources/:id | partial of the above | `Resource` |
| GET | /admin/applications?status=PENDING\|APPROVED\|REJECTED | — | `VolunteerApplication[]` (newest first; never contains the password) |
| POST | /admin/applications/:id/approve | — | `{ok:true}`; 409 INVALID_STATE if already reviewed |
| POST | /admin/applications/:id/reject | `{reason}` | `{ok:true}`; 400 without a reason; 409 INVALID_STATE if already reviewed |
| GET | /admin/volunteers | — | `VolunteerListItem[]` (by name; staff-only, includes phone) |

```text
IncidentListItem = { id, code, type, status, priority: PriorityLevel (effective),
  overridden: boolean, confidence, confidenceBand, people, locationText,
  reportCount, hasVoice: boolean, possibleDuplicateCode: string|null,
  needsReassign: boolean, readyToResolve: boolean,
  escalationRecommended: boolean, escalated: boolean, createdAt, updatedAt }

IncidentDetail = IncidentListItem & { lat, lng, publicArea, vulnerable, trapped,
  medical, danger, needs, summary, confidenceReasons: Reason[],
  priorityScore, computedPriority, priorityReasons: Reason[], overrideReason,
  escalationReasons: Reason[], escalatedAt, verifiedAt, resolvedAt, rejectReason,
  reports: AdminReport[],
  possibleDuplicate: {id, code, type, summary, distanceM: number|null} | null,
  related: {id, code, type, text}[],
  suggestions: VolunteerSuggestion[],
  assignments: {id, volunteerId, volunteerName, volunteerPhone, status, reason, updatedAt}[],   // phone: staff-only, for the WhatsApp button
  allocations: {id, resourceName, quantity, unit, createdAt}[],
  logs: {at, text, public}[],
  chats: ChatThread[] }                       // read-only for admin

AdminReport = { id, label ("Report 1"…), text, transcript, transcriptStatus,
  photoUrl|null, audioUrl|null, audioSeconds, people, needs, phone, phoneVerified,
  extraction, aiSource, processingStatus, lat, lng, locationText, createdAt, receivedAt }

VolunteerSuggestion = { volunteerId, name, score, distanceM|null,
  reasons: string[], missing: string[] }

ChatThread  = { reportId, label ("Reporter 1"…), messages: ChatMessage[] }
ChatMessage = { id, sender: VICTIM|VOLUNTEER, text|null, audioUrl|null,
  lat|null, lng|null, createdAt }

Resource = { id, name, category, quantity, unit, locationText }

VolunteerApplication = { id, name, email, phone, skills, equipment, vehicle,
  locationText, hasLocation, status, rejectReason, proofUrl|null (signed), createdAt, reviewedAt }
VolunteerListItem = { id, name, email, phone|null, skills, equipment, vehicle, availability }
```

**Volunteer (role VOLUNTEER)**

| Method | Path | Request | Response |
|---|---|---|---|
| GET | /volunteer/events | — | `text/event-stream`: `data: {incidentId}` only for incidents this volunteer is assigned to |
| GET | /volunteer/me | — | `VolunteerProfile` |
| PATCH | /volunteer/me | partial `{availability, skills, equipment, vehicle, lat, lng}` | `VolunteerProfile` |
| GET | /volunteer/assignments | — | `VolunteerAssignment[]` (active first, then last 5 finished) |
| POST | /volunteer/assignments/:id/status | `{status, reason?}` | `VolunteerAssignment` |
| GET | /volunteer/assignments/:id/chat | — | `{open, threads: ChatThread[]}` |
| POST | /volunteer/assignments/:id/chat | `{reportId, text?, audioBase64?, audioMime?}` | `ChatMessage`; 409 CHAT_CLOSED |

```text
VolunteerProfile = { id, name, skills, equipment, vehicle, availability, lat, lng }
VolunteerAssignment = { id, status, reason, updatedAt,
  incident: { id, code, type, summary, people, vulnerable, trapped, medical, danger,
              needs, lat, lng, locationText, priority },
  reporters: { reportId, label }[] }        // NO phone numbers, NO names
```

**Dev (only when DEV_MODE=true)**

| POST | /dev/reset | — | `{ok:true}` — runs seed (deletes everything, re-inserts demo data) |
|---|---|---|---|

### 8.3 Frontend `Api` interface (`src/data/index.ts`)

`realApi` implements exactly these functions with the types above:

```text
submitReport(sub)            track(code, pin)             verifyPhone(code, pin, phone, otp)
getVictimChat(code, pin)     sendVictimMessage(code, pin, msg)
getPublicIncidents()
login(email, password)       me()
listIncidents()              getIncident(id)              editIncident(id, patch)
verifyIncident(id, publicArea?)  rejectIncident(id, reason)
overridePriority(id, level, reason?)  escalateIncident(id, note?)  resolveIncident(id, note?)
mergeIncident(id, intoId)    dismissDuplicate(id)
assignVolunteer(id, volunteerId)  cancelAssignment(assignmentId)
allocateResource(id, resourceId, qty)
listResources()  createResource(r)  updateResource(id, patch)
applyAsVolunteer(input)      listApplications(status)     approveApplication(id)
rejectApplication(id, reason)  listVolunteers()
getMyProfile()  updateMyProfile(patch)  listMyAssignments()
updateAssignmentStatus(id, status, reason?)
getAssignmentChat(id)  sendVolunteerMessage(id, reportId, msg)
resetDemo()
watchAdmin(onChange(incidentId|null), onLive?)   watchVolunteer(onChange, onLive?)
watchTrack(code, pin, onChange, onLive?)          // each returns an unsubscribe function (D12)
```

Errors are thrown as `ApiError {code, message}` in both implementations.

---

## 9. Environment variables

| Variable | Where | Example | Meaning |
|---|---|---|---|
| PORT | server | 3000 | |
| SUPABASE_URL | server | https://xxxx.supabase.co | |
| SUPABASE_ANON_KEY | server | … | used only for login |
| SUPABASE_SERVICE_ROLE_KEY | server | … | all data + storage; never sent to browser |
| AI_MODEL | server | hf:Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M | optional; GGUF model URI or file |
| WHISPER_MODEL | server | ./models/ggml-small.bin | optional |
| DEV_MODE | server | true | enables /api/dev/reset and demo OTP hint |
| EMERGENCY_NUMBER | server | 112 | |
| VITE_EMERGENCY_NUMBER | frontend | 112 | |
| SMS_WEBHOOK_SECRET | server | long random text | F27: turns on `/api/sms/incoming`; same value as the gateway app's webhook Signing Key |
| SMS_GATEWAY_URL / SMS_GATEWAY_USER / SMS_GATEWAY_PASSWORD | server | http://192.168.1.20:8080 | F27 replies: the gateway app's Local Server address and login (USB: http://127.0.0.1:8080) |
| VITE_SMS_NUMBER | frontend | +919840000000 | F27: the gateway phone's number; "Send by SMS" is hidden without it |
| FIREBASE_SERVICE_ACCOUNT | server | ./secrets/firebase-service-account.json | F28 push: the Firebase service-account key file (git-ignored). Empty = no push |
| VITE_PUSH_ENABLED | frontend (app) | 1 | set by `npm run app:apk` when `android/app/google-services.json` exists |
| PUBLIC_SERVER_URL / NGROK_AUTHTOKEN | scripts | https://name.ngrok-free.dev | ngrok address (`tunnel:ngrok`, `app:apk`, `sms:connect`) |

In Supabase project settings set **JWT expiry = 86400 seconds** so staff tokens last the whole demo.

---

## 10. Setup (hour 0–2)

1. Create Supabase project → run `supabase/schema.sql` in SQL editor → copy URL/keys into `.env`.
2. `npm install` → `npm run seed` (creates staff users + demo data).
3. Server laptop only: `npm run setup-ai` downloads the AI and speech models into `models/` (~2.5 GB, once). Other machines skip this and use the keyword fallback.
4. Test one Tamil and one English recording.
5. `npm run dev`.
6. Demo mode: `npm run build && npm start` → `npm run tunnel` → open the HTTPS URL on phones (HTTPS is required for GPS, microphone and PWA install).

---

## 11. Key data flows

### 11.1 Report submission (phone)

```text
Report page → build ReportSubmission (id, code, pin generated on phone; deviceId)
  → outbox.enqueue(item)  (ALWAYS, online or offline)
  → navigate /report/sent/:id (show code + PIN + keyword preview)
  → outbox tries sending (see rules.md BR-02)

No internet (F27, BR-06/07):
  S03 "Send by SMS" → phone's SMS app → gateway phone (SIM) → POST /api/sms/incoming
  → report (channel SMS, the phone's code + PIN) → processReport as below → reply SMS
  later, online: outbox → POST /reports (same code + PIN) → photo/voice/full text added to that report
  → pipeline reads it again and adds new facts to the incident (laterFacts)
```

### 11.2 Server pipeline (`server/pipeline.ts`)

```text
POST /reports:
  validate (BR-03) → if id exists: return 200 {ok, code}
  → if code exists with different id: 409 CODE_TAKEN
  → upload photo/audio to storage → insert report (PENDING) → 201
  → processReport(id)  (not awaited)

processReport(id):
  1. if audio: transcript = transcribe(audio_path, app_language) → DONE | FAILED (BR-12)
  2. description = text + "\n" + transcript
  3. {extraction, source} = ai.structureText(description)       (BR-10, BR-11)
  4. apply victim form values over AI values (BR-13)
  5. create incident from extraction (status NEW, code BR-01), set report.incident_id
     log "Report received" (public) and "AI: <source>" (admin)
  6. dup = findDuplicate(incident, active incidents)  → possible_duplicate_of (BR-40)
  7. recomputeIncident(incident.id)
  8. report.processing_status = DONE
  on unexpected error: report.processing_status = FAILED, log to console

recomputeIncident(id):
  load incident + reports + assignments
  confidence = computeConfidence(...)      (BR-20)
  priority   = computePriority(...)        (BR-25)
  escalation = computeEscalation(...)      (BR-30)
  save scores + reasons, updated_at = now
```

`recomputeIncident` is called after: new report processed, merge, verify, admin edit, phone verified, assignment reaches ON_SITE.

### 11.3 Assignment and chat

```text
Admin assign → assignment ASSIGNED → volunteer sees offer (live signal, else poll)
Volunteer ACCEPT → incident IN_PROGRESS, volunteer BUSY, chat opens
Victim Track page (live signal, else poll) → chat visible → messages via /track/chat/send
Volunteer AssignmentPage → one thread per reporter → messages via /volunteer/.../chat
DONE / UNABLE / CANCELLED / incident RESOLVED → chat closed (read-only history)
```

---

## 12. Seed data (server/scripts/seed.ts)

Demo centre point: lat 13.0405, lng 80.2337 ("Central Street").

**Staff** (password for all: `Demo@123`)

| Email | Name | Role | Skills | Equipment | Vehicle | Availability | Location |
|---|---|---|---|---|---|---|---|
| admin@demo.app | Coordinator | ADMIN | — | — | NONE | — | — |
| ravi@demo.app | Ravi | VOLUNTEER | SWIMMING, FIRST_AID, SEARCH_RESCUE | LIFE_JACKET, MEDICAL_KIT, ROPE | MOTORCYCLE | AVAILABLE | ~1.2 km from centre |
| priya@demo.app | Priya | VOLUNTEER | MEDICAL_PRO, FIRST_AID | MEDICAL_KIT | CAR | AVAILABLE | ~2.5 km |
| arun@demo.app | Arun | VOLUNTEER | DRIVING, GENERAL | — | TRUCK | AVAILABLE | ~3 km |
| meena@demo.app | Meena | VOLUNTEER | FIREFIGHTING | FIRE_EXTINGUISHER | MOTORCYCLE | BUSY | ~2 km |
| karthik@demo.app | Karthik | VOLUNTEER | BOAT_HANDLING, SWIMMING | BOAT, LIFE_JACKET | BOAT | AVAILABLE | ~6 km |

**Resources:** Drinking water 200 bottles (Community Center) · Food packets 100 · First aid kits 20 · Blankets 80 · Generator 2 units · Rescue boat 1 · Shelter space 150 people.

**Background incidents (each with 1 report):**
1. ROAD_BLOCKED "Tree fallen, road blocked" ~600 m from centre, VERIFIED, created 30 min before seed time.
2. POWER_OUTAGE "No electricity in whole street" ~900 m, NEW, 45 min before.
3. FIRE, ~3 km, RESOLVED 2 h before.

The demo flood incident is **not** seeded; it is created live during the demo.


---

## 13. Build plan (24 hours)

| Hours | Phase | Deliverable | Owners |
|---|---|---|---|
| 0–2 | A. Foundation | Repo, all files created as empty stubs, `shared/types.ts` + `constants.ts` complete, `App.tsx` routes, `data/index.ts` Api interface, Supabase schema + seed, local LLM + Whisper tested, HTTPS tunnel tested on a phone | Lead + Backend |
| 2–8 | B. UI | Every screen built against the `Api` interface; all `shared/` rule functions + tests | Everyone |
| 8–15 | C. Real backend | All server routes + pipeline (keywords path first, then the local LLM, then Whisper); replace `realApi.ts` stubs with fetch calls | Backend, Lead |
| 15–18 | D. Secondary | Escalation, resources, fake OTP, nearby banner, live dictation (removed 2026-10-01) | Assigned owners |
| 18–21 | E. Testing | Full demo on 2 phones + laptop incl. airplane mode; fix bugs | Everyone |
| 21–24 | F. Demo prep | Reset works, demo script rehearsed, backup video recorded. **No new features after hour 21.** | Everyone |

**Team ownership**

| Owner | Files |
|---|---|
| Lead | `shared/types.ts`, `shared/constants.ts`, `App.tsx`, `src/data/*`, `supabase/schema.sql`, `server/scripts/seed.ts`, `server/index.ts`, merging |
| Victim side | Home, Report, ReportSent, Track, `offline/*`, `lib/codes.ts`, `lib/media.ts`, VoiceRecorder, `shared/keywordExtractor.ts`, `routes/victim.ts` |
| Admin side | admin pages, Badges, ReasonList, Modal, `routes/admin.ts` |
| Volunteer + map | volunteer pages, PublicMap, SafetyMap, ChatBox, `routes/volunteer.ts`, `routes/messages.ts`, `routes/public.ts`, `shared/publicView.ts`, `shared/volunteerMatch.ts` |
| Backend + AI | `server/ai.ts`, `transcribe.ts`, `pipeline.ts`, `storage.ts`, `supabase.ts`, `auth.ts`, `mappers.ts`, `shared/scoring.ts`, `shared/linking.ts`, `shared/trackingStatus.ts` |

**Git:** `main` always runs. Branch per feature `feat/F07-duplicates`. Small PRs, lead merges, merge at least every 3 hours, tag `demo-ok` when a full demo run passes.

---

## 14. Risks and fallbacks

| Risk | Fallback | Cut order if late |
|---|---|---|
| Local LLM slow/bad JSON | Keyword extractor (automatic) | Use keywords only |
| Whisper slow/inaccurate (Tamil) | IndicConformer for Tamil and Hindi (BR-12); admin plays audio; keyboard mic | — |
| Venue internet down (Supabase is cloud) | Phone hotspot for laptop; backup video | — |
| GPS/mic blocked | HTTPS tunnel from hour 1; text location field | — |
| Map tiles fail | List view | — |
| Out of time | Backup video | Nearby banner → fake OTP → resources → escalation → related incidents → voice messages in chat |

**Never cut:** F01 report, F02 offline, F03 voice note, F05 AI/keywords, F06 incident, F09/F10 scores, F12–F14 admin, F15–F16 volunteer, F17 chat, F19 public map.
