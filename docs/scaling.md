# Scaling and resilience

> **Implemented** means in the code and tested. **Proposal** means designed but not built. Numbers are either
> **measured** (how is stated) or **computed** from measured numbers and the configured polling intervals. No load
> test against a real Supabase project has been run (TODO: needs verification).

## 1. Current shape (implemented)

One server process on one laptop: Express API, report pipeline, Whisper and the LLM. Postgres, Storage and Auth run
on Supabase (cloud). Screens poll the API; staff and victim screens also get live change signals
(§7) and then poll only as a slow safety net.

| Resource | Limit today | Where |
|---|---|---|
| AI structuring | One report at a time (one model, one context) | `server/ai.ts` `exclusive()` |
| Speech-to-text | One voice note at a time | `server/transcribe.ts` `exclusive()` |
| Report processing | At most 2 reports in progress; the rest wait in a queue | `server/pipeline.ts` `MAX_CONCURRENT` |
| Server instances | 1: the queue and the in-flight guard live in one process's memory | `server/pipeline.ts` |
| Model memory | ~2 GB (LLM) + ~0.5 GB (Whisper) on the server laptop | `models/` |

## 2. Measured numbers

### 2.1 Database round-trips per API request (measured)
Counted by `tests/integration/api.test.ts` ("Database round-trips per request") on a fake database built from
`supabase/schema.sql`. Each query is one network round-trip to Supabase in production. Staff requests also make one
Supabase Auth call (token check), not included.

| Request | Round-trips |
|---|---|
| `GET /public/incidents` | 2 |
| `POST /track` | 4 |
| `POST /track/chat` | 3 |
| `GET /admin/incidents` | 4 (+1 auth) |
| `GET /admin/incidents/:id` | 10 (+1 auth) |
| `GET /volunteer/assignments` | 4 (+1 auth) |
| `GET /volunteer/assignments/:id/chat` | 4 (+1 auth) |
| New report: `POST /reports` + background processing | 15 |

The test fails if a code change adds queries, so these numbers stay current.

### 2.2 Model latency on the server laptop (measured)
Apple M2, 8 GB RAM, Metal GPU; `eval/bench.ts`, median of 3 runs, synthetic text-to-speech audio (details in
`docs/evaluation.md` §4).

| Step | Median |
|---|---|
| Speech-to-text, 8.4 s English | 1.2 s |
| Speech-to-text + English translation, 8.2 s Hindi / 6.3 s Tamil | 3.5 s / 6.7 s |
| AI structuring per report | 5.1–6.4 s (first call after start: 9–12 s) |
| Model loading at server start | Whisper 0.75 s, LLM 4.4–4.6 s |

Computed: one voice report ≈ 8–13 s of model time; the AI step caps one laptop at roughly 650 reports/hour.
Under heavy memory pressure (8 GB laptop with other apps open) one AI call took 17 minutes, which is why 16 GB is
advised.

## 3. Polling load (computed)

Requests per minute per open screen come from the polling intervals in `shared/constants.ts` and the pages
(`src/pages/*`). Database round-trips = requests × §2.1.

| Open screen | API requests / min | DB round-trips / min |
|---|---|---|
| Public map | 4 | 8 |
| Victim tracking, chat closed (`/track` every 10 s + `/track/chat` every 10 s) | 12 | 42 |
| Victim tracking, chat open (`/track/chat` every 4 s) | 21 | 69 |
| Coordinator dashboard (every 5 s) | 12 | 48 (+12 auth) |
| Coordinator incident page (every 5 s) | 12 | 120 (+12 auth) |
| Volunteer assignment page, chat open | 27 | 108 (+27 auth) |

With live change signals (§7), an **idle** watched screen polls only every 30 s instead: dashboard 2, incident page 2,
victim tracking 4 (two watched calls) and volunteer assignment page 4 requests per minute. When something changes,
each watched screen makes one refresh, never more often than the table above.

**Example (computed, not measured), worst case with every screen polling at the old rates:** 100 victims tracking with chat closed, 200 people on the map, 3 coordinators
on incident pages and 10 volunteers in active chats cause about **2,300 API requests/min (~38/s)** and **~7,200
database round-trips/min (~120/s)**, plus ~300 auth calls/min (3 × 12 + 10 × 27). Polling, not report volume, dominates the load.
Whether a given Supabase plan sustains this is **TODO: needs verification** (plan limits not checked).

## 4. Bottlenecks, in order

1. **AI structuring throughput.** Reports are structured one at a time on one model. The time per report (§2.2)
   caps the reports per hour on one laptop. The queue keeps the rest waiting safely rather than failing them.
2. **Polling fan-out** (§3). The coordinator incident page is the most expensive (10 queries every 5 s). Live change
   signals (§7) cut idle polling about 6×, but every change still costs one refetch per watching screen.
3. **One laptop.** Power, network or hardware failure stops processing; nothing is lost, but nothing moves.
4. **Memory.** On the 8 GB test laptop, running the models alongside other apps caused heavy swapping, and one
   AI call took over 17 minutes (docs/evaluation.md §4). 16 GB is advisable for the server laptop.

## 5. Resilience (implemented and tested)

| Situation | Behaviour | Evidence |
|---|---|---|
| Phone offline | Report saved on the phone; code + PIN shown; sent later by the outbox | F02; demo checklist |
| Database unreachable when a report is sent | API answers 500 (`SERVER_ERROR`); the outbox keeps the report and retries | Test "answers 500 during a database outage…" |
| Database fails during processing | Report marked FAILED (or stays PENDING if even that write fails); retried after 5 s, 30 s, 2 min, then by a sweep every 10 min and at every restart | Test "retries a failed report…" |
| Failure between creating an incident and linking its report (no transactions over PostgREST) | The retry reuses that incident instead of creating a second one. Before this fix it left an orphan incident with no report. | Test "retries a failed report and reuses the incident…" |
| Many reports at once | At most 2 processed together; the rest queue | Test "processes at most two reports at a time…" |
| Server restart | PENDING and FAILED reports are queued again at startup | Test "recovers after a restart…" |
| AI model missing or failing | Keyword fallback; report marked "Structured by keyword fallback" | Test "…keyword fallback when the AI fails"; `AI_MODEL=none` run on 2026-09-29: `source=KEYWORDS type=FLOOD` |
| Speech model missing or failing | Report still processed; "Voice note could not be transcribed — listen to it" | Test "keeps going when transcription fails…" |
| Map images blocked or phone offline | The map switches to a list with a notice | Browser check, §5.1 |

### 5.1 Map-tile fallback check
Run on 2026-09-29 in headless Chrome at phone size. The public-incident API was answered with a fixed list of 2
hazards (so no database was involved), and every OpenStreetMap tile request was aborted (9 blocked). Result:
- the page showed "Map unavailable (map images could not load) — showing a list instead."
- both hazards were listed
- the Map button was disabled

The same list view is used when the phone is offline.

## 6. Data retention (implemented script + proposed policy)

`server/scripts/cleanup.ts` deletes closed incidents (RESOLVED, REJECTED, MERGED) not updated for N days (default
30), together with their reports, chat, assignments, allocations, logs, photos and voice notes, in foreign-key
order. It never touches open incidents, staff or stock. It's a dry run unless `--apply` is given; tested against
the schema, including its foreign keys.

**Proposed policy (for the operating body to decide):**
- Delete closed incidents and their media 30 days after closing, or at the end of the monsoon season if earlier.
- Remove victims' phone numbers from reports as soon as the incident closes (not implemented yet).
- Keep only anonymous counts (type, area, dates) for after-action reports.
- Run the clean-up (dry run first) after each season, and record who ran it.

## 7. Live change signals with Server-Sent Events (implemented 2026-09-29)

**What:**
- **Staff and victim screens open one stream each:** `GET /api/admin/events`, `GET /api/volunteer/events` or
  `POST /api/track/events`.
- **The stream carries only a signal:**
  - to admins, the id of the incident that changed
  - to a volunteer, only the ids of their own incidents
  - to a victim, just "your report changed", with no id

  On a signal the screen refetches with its normal, authorised API call, so **no report data travels on a stream**.
- **Code:** `server/events.ts` (merges signals per `STREAM_COALESCE_MS`, sends a ping every `STREAM_PING_MS`), the
  stream reader in `src/data/realApi.ts` (fetch-based so it can send the login token; reconnects with backoff; stops
  for good on 401/403/404), and `usePoll(…, watch)`.

**Load rule:** a screen refreshes on a signal but never more often than its old polling interval. While the stream
is live it polls only every `POLL_FALLBACK_MS` (30 s) as a safety net; without a stream it polls exactly as before.
A stream counts as live only once bytes arrive, so a proxy that buffers the stream leaves the screen on normal polling.

**Evidence:**
- **API tests** (`tests/integration/api.test.ts`, "Live change signals"):
  - login and code/PIN are required
  - several writes to one incident produce one admin signal
  - a volunteer gets signals only for their own incidents
  - a victim gets signals only for their own report, and no ids
  - a report is followed from before it has an incident until it is processed
  - streams are released when the client disconnects

  Mutation checks M11–M13 were caught (docs/verification.md).
- **Browser check (headless Chrome, real frontend, stand-in API; 20 s on the coordinator dashboard):**

  | Stream | Dashboard requests after the first load | Reaction to a change |
  |---|---|---|
  | Live, one change signal at 14.2 s | 1 (the refresh 40 ms after the signal) | Updated 40 ms after the signal |
  | Endpoint answers 404 | Every 5 s (5.0, 10.0, 15.0, 19.9 s), no stream retries | Next poll, up to 5 s |

**Computed effect on load (§3):** an idle coordinator incident page goes from 12 to 2 requests per minute (120 → 20
database round-trips per minute); an idle victim tracking page goes from 12 to 4 (42 → 14). During busy periods it
is never more than the old polling.

**Limits and open checks:**
- The signal bus lives in one process; several server instances would need Postgres `LISTEN/NOTIFY` (§8).
- Whether Cloudflare quick tunnels pass streams through without buffering hasn't been checked
  (**TODO: needs verification**). If they buffer, screens simply keep polling at the normal rate.
- In development builds React mounts each screen twice, so the first load makes two requests; production builds
  don't.

## 8. Path to more than one laptop (roadmap, not built)

1. **Database-backed work queue.** Claim reports with a row lock (`select … for update skip locked` in a Postgres
   function called over RPC), adding `claimed_by` / `claimed_at` columns. Several workers can then share the load and a crashed
   worker's claim can expire. Needs a schema change (lead-only).
2. **Separate the model worker from the API.** API instances stay light and stateless. One or more worker machines
   with GPUs run Whisper and the LLM from the queue.
3. **Optional hosted inference** for large events: faster, but reports would leave the local network. This needs
   a privacy decision by the operating body.
4. **Carry the change signals (§7, done in-process) across instances** with Postgres `LISTEN/NOTIFY`.
5. **Cache the public map** (same answer for everyone) for 10–15 s, or serve it from a CDN.
6. **A second server laptop on standby** with the same `.env` and models. Because reports wait safely on phones and
   in the database, a manual switch is enough for a small deployment.
