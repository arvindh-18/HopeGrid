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

## Only you can do these

- **Rotate the Supabase keys.**
- **Run `supabase/schema.sql` again** so the `volunteer_applications` table exists.
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
