# Verification — what was tested and how

Every result below was produced on the machine and date shown, with the exact commands given. Re-run them to
reproduce. Nothing here was estimated.

| | |
|---|---|
| Date | 2026-09-29, 19:25 IST |
| Machine | Apple M2, macOS 26.5.2 |
| Node.js | v22.23.3 |
| Test runner | Vitest 5.0.1 |

---

## 1. Summary

| Check | Command | Result |
|---|---|---|
| Type check (frontend + tests, and strict server) | `npm run typecheck` | exit 0, no errors |
| Business-rule unit tests | `npm test` (file `tests/rules.test.ts`) | 28 passed |
| API integration tests | `npm test` (file `tests/integration/api.test.ts`) | 55 passed |
| WhatsApp link builder | `npm test` (file `tests/whatsapp.test.ts`) | 2 passed |
| **All tests** | `npm test` | **85 passed, 0 failed** (3 files, ~3.5 s — the live-signal tests wait for signal windows) |
| Production build | `npm run build` | exit 0 (`built in 357ms`, 22 files precached) |
| Tests catch real bugs | 13 deliberate code breaks, see §4 | 13 of 13 caught |

Output of `npx vitest run` (end), after the approved follow-ups (type rule BR-11a, live change signals):
```
 Test Files  2 passed (2)
      Tests  83 passed (83)
   Duration  3.50s (tests 87%, transform 9%, import 3%)
```
(Earlier runs: 68 tests after Phase 2, 74 after Phase 4. The suite was also run 3 times in a row after adding the
stream tests: 83/83 each time.)

---

## 2. How the integration tests work

`tests/integration/api.test.ts` sends real HTTP requests to the **real Express routers, pipeline and business rules**
(`server/routes/*`, `server/pipeline.ts`, `server/ai.ts`, `shared/*`). Three things are replaced, so tests never touch
real data or run a model (rules.md AR-31):

| Replaced | By | Fidelity |
|---|---|---|
| Supabase (Postgres, Storage, Auth) | `tests/integration/fakeSupabase.ts`: in-memory tables **built by reading `supabase/schema.sql`** | Enforces the schema's defaults, NOT NULL, UNIQUE, CHECK and foreign keys; rejects unknown columns; refuses UPDATE/DELETE without a filter (as Supabase does) |
| The local LLM | `tests/integration/stubs.ts`: replaces only the `node-llama-cpp` calls | `server/ai.ts` still runs its real prompt, `coerce()` clean-up and keyword fallback |
| Whisper | `tests/integration/stubs.ts`: `transcribe()` returns a set transcript or throws | The pipeline's handling of transcripts, translations and failures is real |

The app is wired by `tests/integration/testApp.ts` in the same order and with the same error envelope as
`server/index.ts`. `server/index.ts` can't be imported in tests, because importing it starts the server and loads the
models, so the wiring is copied and must be kept in sync.

---

## 3. What is covered (all 83 tests)

### API integration tests (55)
**Report submission (F01, BR-02, BR-03)**
- is idempotent: resending the same report returns the same code and creates nothing new, even when resent with a
  regenerated code
- answers `CODE_TAKEN` when another report already uses the code
- rejects 12 kinds of bad input with `VALIDATION` and stores nothing:
  - no content, no location, latitude without longitude
  - more than 500 people, an unknown need, a malformed phone number, a malformed PIN
  - a PNG instead of a JPEG, non-base64 "photo", MP4 labelled as WebM, unsupported audio type, voice note over 60 s
- stores a valid photo and voice note under `reports/<id>/…` in the private bucket

**Report pipeline (F05, F06, BR-10…BR-13)**
- creates an incident with scores and logs, using the keyword fallback when the AI fails (type FLOOD, trapped,
  vulnerable, CRITICAL, confidence 45, logs "Report received" public + "Structured by keyword fallback" admin)
- uses the AI answer, cleans it up (people 900 → dropped; `"yes"` is not `true`; unknown need dropped), and the
  victim's own answers win (people 3; needs unioned)
- report text can't take actions: extra fields in model output (`status: "RESOLVED"`, `verified: true`) are ignored
  (AR-20)
- non-English voice notes are stored as original + `English:` line, and the AI receives both
- a failed transcription still creates the incident and tells staff to listen to the recording
- restart recovery: `PENDING` reports are processed; a half-finished report does not create a second incident

**Duplicates and merge (F07, BR-40…BR-52)**
- a report ~100 m away from another phone is flagged `possible_duplicate_of` — both incidents stay `NEW`,
  nothing is merged automatically
- the same type 3 km away is not flagged
- only a coordinator merges; reports move, confidence rises (45 → 65), the source becomes `MERGED`; self-merge and
  re-merge are refused
- "Not a duplicate" clears the flag once, then answers `INVALID_STATE`

**Status rules and access control (BR-100…BR-104)**
- verify twice, escalate twice, and resolve/verify/assign/override/edit on a rejected incident → `INVALID_STATE`
- a volunteer can't skip steps (ASSIGNED → DONE/ON_SITE/EN_ROUTE/ASSISTING/CANCELLED all refused) or change another
  volunteer's assignment (`FORBIDDEN`)
- admin endpoints: no token or forged token → 401, volunteer token → 403; volunteer endpoints with admin token → 403;
  wrong password → 401

**Assignments (F14, F15)**
- accept → incident `IN_PROGRESS`, volunteer `BUSY`, victim sees "A volunteer has been assigned"; "unable" (reason
  required) → incident back to `VERIFIED`, volunteer `AVAILABLE`, dashboard shows "needs reassign"
- decline keeps an unverified incident `NEW`; the same volunteer can't be assigned again and isn't suggested
- full journey EN_ROUTE → ON_SITE (confidence +20) → DONE → coordinator resolves; the victim's step follows each change

**Chat (F17, BR-70…BR-73)**
- closed before a volunteer accepts and while only ASSIGNED (`CHAT_CLOSED`); open during ACCEPTED, EN_ROUTE,
  ON_SITE and ASSISTING; closed after DONE while history stays readable
- no names, emails or phone numbers in victim chat, tracking, volunteer chat or volunteer assignment responses
- a volunteer can only message reporters of their own incident (`FORBIDDEN`)

**Public and victim data (AR-22, BR-80, BR-81, BR-140)**
- an unverified incident is not public; after verification the payload has exactly the 13 public fields,
  coordinates rounded to 3 decimals, and none of: report text, names, phone, code, PIN, report id, street address,
  exact coordinates; a rejected incident disappears
- tracking returns only the 6 tracking fields and public updates; a wrong PIN gets a generic 401
- phone verification needs the OTP and adds 5 confidence points

**Processing queue and resilience (D9)** — added in Phase 4
- a report that failed right after its incident was created is retried and **reuses** that incident (no orphan)
- during a database outage the API answers 500, so the phone's outbox keeps the report; it's accepted afterwards
- at most 2 reports are processed at a time; the rest wait in the queue

**Retention clean-up (server/scripts/cleanup.ts)** — added in Phase 4
- deletes only closed incidents older than the cut-off, with their reports, chat, assignments, allocations, logs and
  photos, in foreign-key order; open incidents, stock and staff are untouched; planning alone deletes nothing
- refuses a cut-off under one day

**Database round-trips per request** — added in Phase 4: measured counts pinned as budgets (docs/scaling.md §2.1)

**Incident type rule (BR-11a)** — approved follow-up
- the AI's known `HEAVY_RAIN` answer is replaced by the keyword type (POWER_OUTAGE) when the keyword rules find
  one; the AI's type is kept when they find nothing

**Live change signals (architecture D12)** — approved follow-up
- staff streams need the right login (401/403), a victim stream the right code and PIN (401)
- the admin stream names each changed incident once per burst of writes (3 writes → 1 signal)
- a volunteer's stream signals only incidents they are assigned to; other incidents' ids are never sent
- a victim's stream signals only their own report and carries no ids
- a victim's stream follows the report from before it has an incident until it is processed
- the server stops listening when the client disconnects

**Demo reset guard (F23)**
- refused through the Cloudflare tunnel (`CF-Connecting-IP`), through any proxy (`X-Forwarded-For`) and for a
  public host name; allowed only as a direct request on the server laptop; the route doesn't exist when
  `DEV_MODE` is off

### Business-rule unit tests (28)
Keyword extraction in English, Tamil and Hindi · the incident-type rule (BR-11a) · confidence · priority and
escalation · duplicates and related incidents · merge fields · volunteer ranking · public view (including the
stricter BR-80) · victim tracking steps.

---

## 4. Do the tests catch real bugs? (mutation check)

Each break below was applied to the real code, the full test suite was run, and the file was restored from a
backup.

| Deliberate break | Tests that failed |
|---|---|
| M1 — remove the idempotency check in `POST /api/reports` | 1: "is idempotent…" |
| M2 — make `NEW` incidents public in `shared/publicView.ts` | 2: the BR-80 unit test and the public-payload API test |
| M3 — let a victim send chat while no volunteer has accepted | 1: "is closed until a volunteer accepts…" |
| M4 — allow a volunteer to jump ASSIGNED → DONE | 1: "does not let a volunteer skip steps…" |
| M5 — let the demo reset trust any request from 127.0.0.1 | 3: all three "refuses a reset…" tests |
| M6 — create a new incident on retry instead of reusing the orphan | 1: "retries a failed report and reuses the incident…" |
| M7 — allow 5 reports in progress at once | 16: the concurrency test, plus 15 later tests whose reports were left paused (since fixed: the test now always releases them) |
| M8 — the sweep ignores FAILED reports | 1: "retries a failed report…" |
| M9 — the clean-up deletes reports before their chat messages | 1: the clean-up test fails with "violates foreign key constraint (messages.assignment_id)" |
| M10 — the AI's type is used without the BR-11a rule | 1: "uses the keyword type when the keyword rules find one…" |
| M11 — the volunteer stream is not filtered | 1: "a volunteer's stream signals only the incidents they are assigned to" |
| M12 — the victim stream sends the incident id | 1: "a victim's stream signals only their own report, and carries no ids" |
| M13 — no merging of signals | 1: "the admin stream names each changed incident, once per burst of writes" |

Result: **13 of 13 breaks caught**. Apart from M7's knock-on failures, only the intended tests failed each time.

---

## 5. Other checks run while building (Phase 1)

| Check | How | Result |
|---|---|---|
| Upload signature check on real files | Files made with the bundled ffmpeg: WebM/Opus, MP4/AAC, Ogg/Opus audio, a JPEG, a PNG | 9 of 9 cases correct (valid files accepted; PNG as photo, MP4 labelled WebM, JPEG as audio, non-base64 rejected) |
| Real browser recordings pass the check | Chrome 154 `MediaRecorder` (fake microphone) — default, `audio/webm`, `audio/mp4` | All accepted: `audio/webm;codecs=opus` (starts `1a45dfa3`), `audio/mp4;codecs=opus` (`ftyp` at byte 4) |
| Live-signal client in a real browser | Headless Chrome, real frontend, stand-in API on a spare port, coordinator dashboard for 20 s | Stream live: no polling, refresh 40 ms after the one signal. Stream endpoint 404: polling every 5 s, no stream retries (docs/scaling.md §7) |
| Vite dev proxy adds no forwarding headers | Echo server on :3000 behind the Vite proxy | No `X-Forwarded-For`/`CF-Connecting-IP`/`Forwarded`, so the DEV "Reset demo data" button still works |

---

## 6. Not covered — needs verification

- **Real Supabase:** the fake follows `schema.sql` but isn't Postgres (no RLS, no real network errors, no
  PostgREST-specific quirks). TODO: needs verification — a run against a disposable Supabase project.
- **Real AI and Whisper quality:** stubbed here. Measured separately in `docs/evaluation.md`.
- **The browser UI:** no automated UI tests in the repo.
- **iPhone/Safari recordings** against the upload check: not tested (Safari can't be automated here). TODO: needs
  verification — record one voice note on an iPhone and submit it.
- **A real Cloudflare tunnel** against the demo-reset guard: tested with the headers and host name a tunnel adds, but
  not through a live tunnel. TODO: needs verification.
- **Load:** no load test was run; database round-trips per request are measured and the load is computed in
  `docs/scaling.md`.
- **Live signals through a real Cloudflare tunnel:** not tested (TODO: needs verification). If the tunnel buffers
  streams, screens keep polling at the normal rate, because a stream counts as live only once bytes arrive.
- **Rate limiting:** not implemented (owner decision for the hackathon). The 4-digit tracking PIN can therefore be
  guessed by repeated requests; see `docs/scaling.md` and `PROJECT.md` known limitations.

## 7. Reproduce

```bash
npm install
npm run typecheck     # expect exit 0
npm test              # expect: Test Files 3 passed, Tests 85 passed
npm run build         # expect exit 0
```
No `.env` and no models are needed: checked by running the suite in a copy of the project without `.env` and
`models/` (83 passed). The tests make no calls to Supabase, the LLM or Whisper; running them with the network
switched off was not tested.
