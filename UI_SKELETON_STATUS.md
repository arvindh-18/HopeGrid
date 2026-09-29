# UI Skeleton Status

Phase: **UI skeleton complete** (mock data, no server). Source of truth: `docs/architecture.md`, `docs/features.md`, `docs/rules.md`; visual language from `docs/DESIGN.md`.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173  (VITE_USE_MOCK defaults to true)
npm test             # 22 rule tests (shared/)
npm run build        # typecheck + production build + service worker
```

Use the lime **Demo** button (bottom-left on desktop, top-right on phones) to reset data, inject the second victim report, switch between Coordinator and Ravi, simulate offline, use real GPS, or make the next request fail.

## Routes (all from architecture §5.2)

| Route | Screen | Role | Key states |
|---|---|---|---|
| `/` | S01 Home | Public | unsent-reports notice, reports from this phone, offline banner |
| `/report` | S02 Report | Public | locating / location error, validation message, voice recorder (recording, saved, mic blocked), photo compress error, offline-safe submit |
| `/report/sent/:id` | S03 Report sent | Public | queued / sending / sent / failed, retry, keyword preview, not-on-this-phone empty state |
| `/track` | S04 Track | Public | code+PIN form & errors, unsent-report notice, 7-step progress, closed (rejected), phone OTP (demo code 123456), chat closed/open, stale data |
| `/map` | S05 Safety map | Public (all roles) | map / list, automatic list when tiles fail or offline, nearby-hazard alert, selected-pin card, legend, empty, error |
| `/login` | S06 Staff login | Public | validation, wrong credentials, demo account chips |
| `/admin` | S07 Dashboard | Admin | priority counters, status/type filters, search, flags, newly-arrived highlight, empty, error, stale |
| `/admin/incidents/:id` | S08 Incident | Admin | duplicate banner, escalation banner, ready-to-resolve, needs-reassign, terminal states, 10 action modals, not found |
| `/admin/resources` | S11 Resources | Admin | table, inline edit, add modal with validation, empty |
| `/volunteer` | S09 Volunteer home | Volunteer | availability toggle (locked while busy), new request with accept/decline-reason, current assignment, skills modal, recent |
| `/volunteer/assignments/:id` | S10 Assignment | Volunteer | step bar, next-step buttons, "I can't continue" reasons, done confirmation, cancelled/declined notices, multi-reporter chat tabs |
| `*` | 404 | Any | — |

Role guard: unauthenticated → `/login`; wrong role → that role's home.

## Journeys verified end-to-end (headless Chromium, production build)

1. Victim reports (text) → code + PIN → tracks → sees "Being reviewed".
2. Second phone reports nearby with photo + verified phone → flagged as possible duplicate.
3. Coordinator: dashboard → incident → merge → confidence 85 → verify with public area → 99, Critical 77, escalation recommended, related road-block and power-outage incidents shown.
4. Assign Ravi (top suggestion, score 100) → Ravi accepts → on the way → chat quick reply → victim sees "Help is on the way" and the message, replies.
5. Ravi arrives → help completed → coordinator resolves → public map shows green.
6. Offline: report while "Simulate offline" → saved on phone → back online → sent automatically.
7. Error / stale: "Make next request fail" → dashboard keeps old data with "Could not refresh" line.

Console: no application errors. Only errors seen are blocked OpenStreetMap tile requests in the sandbox, which correctly triggered list mode.

## Architecture of the skeleton

```
pages / components  ──>  src/data/index.ts (Api interface, only entry point)
                              ├── mockApi.ts  (now)   ── mockData.ts, localStorage "mockdb", IndexedDB media
                              └── realApi.ts  (Phase C stubs naming every endpoint)
shared/  ── real business rules used by mockApi today and by the server later
```

- No component or page imports `mockApi.ts` or `mockData.ts` (AR-12). All fixtures live in `src/data/mockData.ts`.
- The mock uses the **real** `shared/` rules: keyword extraction, confidence, priority, escalation, duplicates, related incidents, merge, matching, public view, victim steps.
- Mock latency 300 ms; "processing" of a new report takes ~1.6 s so the RECEIVED → REVIEWING step is visible.

## Components

`Layout` (dark nav per role, mobile menu, offline banner, emergency banner, Demo menu), `ui.tsx` (Button, Field, Toggle, Spinner, Skeleton, LoadingBlock, EmptyState, ErrorState, Notice, FreshnessLine, Toast, PageHeader, Section, time helpers), `Badges` (Priority, Confidence, Status, Assignment, Tag), `ReasonList`, `Modal`, `VoiceRecorder`, `ChatBox`, `SafetyMap`, `Icons`.

## Design system (from DESIGN.md)

Canvas #f4f4f4, white cards 16 px radius, dark #212121 nav, black pill primary buttons, lime #c7eb08 used scarcely (verify, "help completed", toggles, active-response tags, focus ring), 5 px inputs, DM Sans body / Plus Jakarta Sans display (the documented substitutes, bundled via @fontsource so the report page works offline), negative letter-spacing, 70 % modal overlay, no gradients. Added a severity scale (critical red = the DESIGN error colour, orange, amber, green) because the product needs one. The emergency button is the one bold element.

## Assumptions and deviations (need lead approval — AR-04/AR-06)

1. **Extra files not in architecture §5:** `src/components/ui.tsx`, `src/components/Icons.tsx`, `UI_SKELETON_STATUS.md`. Everything else matches the file list.
2. **Extra dependencies:** `@fontsource/dm-sans`, `@fontsource/plus-jakarta-sans` (self-hosted fonts so S02 needs no network, AR-25).
3. **Extra error code** `NETWORK` in `shared/types.ts` (offline / fetch failure). Not sent by the server; client-only.
4. Demo-only helpers (`devTools`) exported from `src/data/index.ts`; `null` when `VITE_USE_MOCK=false`.
5. In mock mode the device location defaults to the demo centre (13.0405, 80.2337) so duplicates and related incidents line up on any laptop; the Demo menu can switch to real GPS.
6. Mock extraction is always labelled "Structured by keywords" (no AI in the browser); voice notes get the canned transcript from `mockData.ts`.
7. The injected second report uses an SVG placeholder photo and is marked phone-verified (demo step 4 shortcut).
8. The Send report button uses `aria-disabled` and explains what is missing when tapped, instead of a silent disabled button.
9. Small UI additions: dashboard search box, "New" highlight on the queue, "Reports from this phone" list on Home, demo tracking hint (RB7K2M / 1111).
10. `server/` and `data/` contain **empty placeholder files** only (merged from the project structure). They follow an earlier JSON-database layout, not the Supabase layout in `docs/architecture.md` v3 — reconcile before backend work.

## Known limitations

- Map tiles need the internet; list mode covers offline and blocked tiles.
- Live dictation (F24) only appears in browsers with SpeechRecognition and while online.
- Mock data is per-browser (localStorage); two tabs of the same browser share it, two devices do not.
- Main JS bundle is ~590 kB (Leaflet + React); acceptable for the hackathon, code-split later if needed.

## Integration points — files that change per real feature

| Feature | Files to change | UI files that should NOT change |
|---|---|---|
| F01/F02 report submit + dedupe by id | `realApi.submitReport`, `server/routes/victim.ts`, `server/db.ts` | Report.tsx, outbox.ts |
| F03/F04 voice + Whisper | `server/transcribe.ts`, `server/pipeline.ts` | VoiceRecorder.tsx |
| F08 AI structuring | `server/ai.ts`, `server/pipeline.ts` | IncidentPage.tsx (already shows AI/keyword tag) |
| F06/F07 tracking + OTP | `realApi.track/verifyPhone`, `server/routes/victim.ts` | Track.tsx |
| F09 scores, F13 duplicates, F14 escalation, F15 related | `server/pipeline.ts` (recomputeIncident) using existing `shared/` | Dashboard.tsx, IncidentPage.tsx |
| F11 auth | `realApi.login/me` (bearer token), `server/auth.ts` | Login.tsx, useAuth.tsx |
| F12/F18/F21 admin actions & resources | `realApi.*`, `server/routes/admin.ts` | admin pages |
| F10/F16 volunteer | `realApi.*`, `server/routes/volunteer.ts` | volunteer pages |
| F17 chat | `realApi.*Chat*/send*`, `server/routes/victim.ts` + `volunteer.ts` | ChatBox.tsx |
| F19/F20 public map | `realApi.getPublicIncidents`, `server/routes/public.ts` (uses `shared/publicView.ts`) | PublicMap.tsx, SafetyMap.tsx |
| F22 seed | `server/scripts/seed.ts` (same meaning as `mockData.ts`) | — |

Switching over: set `VITE_USE_MOCK=false` once `realApi.ts` stubs are replaced with fetch calls to the endpoints already named in each stub.
