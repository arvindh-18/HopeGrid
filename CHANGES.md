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
- **Demo note:** the seeded volunteers have no phone numbers, and there's no screen to add one. Add your teammates'
  real numbers in Supabase (`profiles.phone`, e.g. `+9198…`), or the button explains that there's no number.
- Automatic sending (WhatsApp Business API, template approval, volunteer opt-in) is roadmap.

## Only you can do these

- **Rotate the Supabase keys.**
- **Tell me the hackathon track** (placeholder at the top of `docs/problem.md`).
- **Check live updates through a real `npm run tunnel` link** on two phones (not tested through a live tunnel).
- **Collect real user feedback** (plan + template: `docs/impact-and-deployment.md` §6–7).
- **Record a demo video.**
- **Choose a licence.**

## Places marked "TODO: needs verification"

- `docs/problem.md` §2: how often emergency lines are overwhelmed, how long requests wait, how many are duplicates.
- `docs/comparison.md` §5: other tools' triage features, where KoboToolbox's AI runs, and what Indian authorities
  currently use.
- `docs/verification.md` §6: a run against a real Supabase project, iPhone/Safari recordings, and a live Cloudflare
  tunnel against the reset guard.
- `docs/scaling.md`: Supabase plan limits for the computed polling load; whether Cloudflare quick tunnels pass the
  live-signal streams through unbuffered.
