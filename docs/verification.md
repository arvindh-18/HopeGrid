# Verification — what was tested and how

Every result below was produced on the machine and date shown, with the exact commands given. Re-run them to
reproduce. Nothing here was estimated.

| | |
|---|---|
| Date | 2026-09-29, 19:25 IST; counts updated 2026-09-30 (volunteer registration F26, map radius BR-85, Android app) |
| Machine | Apple M2, macOS 26.5.2 |
| Node.js | v22.23.3 |
| Test runner | Vitest 5.0.1 |

---

## 1. Summary

| Check | Command | Result |
|---|---|---|
| Type check (frontend + tests, and strict server) | `npm run typecheck` | exit 0, no errors |
| Business-rule unit tests | `npm test` (file `tests/rules.test.ts`) | 29 passed |
| API integration tests | `npm test` (file `tests/integration/api.test.ts`) | 69 passed |
| WhatsApp link builder | `npm test` (file `tests/whatsapp.test.ts`) | 2 passed |
| Android app server address | `npm test` (file `tests/serverUrl.test.ts`) | 2 passed |
| **All tests** | `npm test` | **102 passed, 0 failed** (4 files, ~3.6 s — the live-signal tests wait for signal windows) |
| Production build | `npm run build` | exit 0 (`built in 347ms`, 22 files precached) |
| Tests catch real bugs | 16 deliberate code breaks, see §4 | 16 of 16 caught |

Output of `npx vitest run` (end), after adding the Android app:
```
 Test Files  4 passed (4)
      Tests  102 passed (102)
   Duration  3.93s (tests 72%, transform 21%, import 7%)
```
(Earlier runs: 68 tests after Phase 2, 74 after Phase 4, 83 after the approved follow-ups, 85 with the WhatsApp link
tests, 97 with volunteer registration, 98 with the map radius. The suite was also run 3 times in a row after adding the stream tests: 83/83 each time.)

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

## 3. What is covered (all 102 tests)

### API integration tests (67)
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

**Volunteer registration (F26, BR-150)** — 12 tests
- full journey: apply → the row is PENDING, has no password in it, and the ID proof is in the private bucket →
  logging in answers 401 "waiting for a coordinator to approve" → the admin list shows the application (equipment,
  signed proof link, no `password` anywhere) → approve → approving again is `INVALID_STATE` → the same email and
  password log in as VOLUNTEER → listed in `/admin/volunteers` → suggested for a new incident
- reject needs a reason; afterwards the login is gone, the proof file is deleted, logging in says "Email or password
  is incorrect.", and the same email can apply again
- 8 bad applications are refused and leave nothing behind (no row, no login, no file): bad email, short password,
  no skills, unknown skill, unknown equipment, malformed phone, no proof, a PNG instead of a JPEG
- an email that already has an account is refused with "An account with this email already exists."
- the application endpoints answer 401 without a token and 403 for a volunteer; nothing changes

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
| M14 — approve without checking the application is still PENDING | 1: the full-journey test (the second approve fails on the duplicate profile instead of answering `INVALID_STATE`) |
| M15 — reject without deleting the login | 1: "rejecting needs a reason, removes the login…" |
| M16 — accept any file as ID proof (no JPEG check) | 1: "rejects an application with a PNG instead of a JPEG proof…" |

Result: **16 of 16 breaks caught**. Apart from M7's knock-on failures, only the intended tests failed each time.
M14–M16 (2026-09-30) were checked with the volunteer-registration group only (`vitest run tests/integration -t "Volunteer registration"`); the restored files were compared byte-for-byte with the backups.

---

## 5. Other checks run while building (Phase 1)

| Check | How | Result |
|---|---|---|
| Upload signature check on real files | Files made with the bundled ffmpeg: WebM/Opus, MP4/AAC, Ogg/Opus audio, a JPEG, a PNG | 9 of 9 cases correct (valid files accepted; PNG as photo, MP4 labelled WebM, JPEG as audio, non-base64 rejected) |
| Real browser recordings pass the check | Chrome 154 `MediaRecorder` (fake microphone) — default, `audio/webm`, `audio/mp4` | All accepted: `audio/webm;codecs=opus` (starts `1a45dfa3`), `audio/mp4;codecs=opus` (`ftyp` at byte 4) |
| Live-signal client in a real browser | Headless Chrome, real frontend, stand-in API on a spare port, coordinator dashboard for 20 s | Stream live: no polling, refresh 40 ms after the one signal. Stream endpoint 404: polling every 5 s, no stream retries (docs/scaling.md §7) |
| Android app on an emulator (2026-09-30) | `HopeGrid.apk` on the Android 14 emulator (Pixel 3a) against a temporary server (port 3001, no AI) through a quick tunnel | Server address accepted and checked; Home as on the web; Android location prompt → map with tiles, radius circle and pin; Report captured GPS (±5 m); microphone prompt → recording ran; coordinator login → dashboard. Not tested: camera, live updates in the app, a real phone |
| Map radius in a real browser (2026-09-30) | Headless Chrome, the built app, a stand-in API with hazards 1, 4 and 8 km from a simulated GPS position | 5 km (default) showed 2 pins, the dashed circle and "1 more is farther than 5 km."; 2 km → 1; 10 km → 3; the choice survived a reload; Tamil on a 390 px phone fits with no sideways scrolling; with location denied all 3 showed with the note |
| Volunteer registration screens in a real browser (2026-09-30) | Headless Chrome, real frontend, stand-in API on a spare port. Phone size (390 px): filled the form, attached an ID photo, sent. Laptop: `/admin/volunteers` | Form sent the expected fields (no GPS, area "Anna Nagar", JPEG proof) and showed "Application received"; no sideways scrolling. Admin page showed "Waiting for review (2)" with proof photos, and the Volunteers tab listed 2 volunteers with a WhatsApp link for the one with a phone |
| Vite dev proxy adds no forwarding headers | Echo server on :3000 behind the Vite proxy | No `X-Forwarded-For`/`CF-Connecting-IP`/`Forwarded`, so the DEV "Reset demo data" button still works |

---

## 6. Not covered — needs verification

- **Real Supabase:** the fake follows `schema.sql` but isn't Postgres (no RLS, no real network errors, no
  PostgREST-specific quirks). TODO: needs verification — a run against a disposable Supabase project.
- **Real AI and Whisper quality:** stubbed here. Measured separately in `docs/evaluation.md`.
- **The browser UI:** no automated UI tests in the repo.
- **Volunteer registration against real Supabase Auth:** the fake mimics `auth.admin.createUser`/`deleteUser`. TODO:
  needs verification — after running `supabase/schema.sql`, register one test volunteer, approve, log in; register a
  second, reject, and check the user is gone under Authentication → Users. The duplicate-email check relies on
  Supabase's error text containing "already", "registered" or "exists".
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
