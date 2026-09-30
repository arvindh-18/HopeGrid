# features.md — Hyperlocal HopeGrid Platform (Hackathon MVP v3)

> **Purpose of this file:** WHAT to build: every feature (`F01`–`F25`), every screen (`S01`–`S11`), acceptance checks, and the demo scenario that proves the product works.
> **Structure, files, database and API:** see `architecture.md`. **Behaviour rules (`BR-*`) and agent rules (`AR-*`):** see `rules.md`.
> A feature is done only when every acceptance check passes against the real backend.

---

## 1. Feature list

| ID | Feature | Priority | Role | Main files | Depends on |
|---|---|---|---|---|---|
| F01 | Emergency report form | MUST | Victim | pages/Report.tsx, routes/victim.ts | F23 |
| F02 | Offline outbox & sync | MUST | Victim | offline/outbox.ts, pages/ReportSent.tsx | F01 |
| F03 | Voice note on report | MUST | Victim | components/VoiceRecorder.tsx | F01 |
| F04 | Report tracking (code + PIN) | MUST | Victim | pages/Track.tsx, routes/victim.ts, shared/trackingStatus.ts | F06 |
| F05 | AI structuring (Whisper + local LLM + keyword fallback) | MUST | System | server/ai.ts, server/transcribe.ts, server/pipeline.ts, shared/keywordExtractor.ts | F01, F03 |
| F06 | Incident creation & lifecycle | MUST | System/Admin | server/pipeline.ts, routes/admin.ts | F05 |
| F07 | Duplicate detection & merge | MUST | System/Admin | shared/linking.ts, routes/admin.ts | F06 |
| F08 | Related incidents (cascade) | MUST | System | shared/linking.ts | F06 |
| F09 | Confidence score with reasons | MUST | System | shared/scoring.ts | F06 |
| F10 | Priority score with reasons + admin override | MUST | System/Admin | shared/scoring.ts | F06 |
| F11 | Staff login | MUST | Admin, Volunteer | pages/Login.tsx, hooks/useAuth.tsx, routes/authRoutes.ts, server/auth.ts | — |
| F12 | Admin dashboard | MUST | Admin | pages/admin/Dashboard.tsx | F06, F09, F10 |
| F13 | Admin incident page (review, verify, reject, edit, resolve) | MUST | Admin | pages/admin/IncidentPage.tsx | F12 |
| F14 | Volunteer suggestions & assignment | MUST | Admin | shared/volunteerMatch.ts, IncidentPage.tsx | F13, F16 |
| F15 | Volunteer assignment workflow | MUST | Volunteer | pages/volunteer/*, routes/volunteer.ts | F14 |
| F16 | Volunteer availability & profile | MUST | Volunteer | VolunteerHome.tsx, routes/volunteer.ts | F11 |
| F17 | Private volunteer ↔ victim chat | MUST | Victim, Volunteer (Admin reads) | components/ChatBox.tsx, routes/messages.ts | F04, F15 |
| F18 | Escalation recommendation (simulated escalation) | SHOULD | System/Admin | shared/scoring.ts, IncidentPage.tsx | F10 |
| F19 | Public safety map | MUST | Community | pages/PublicMap.tsx, components/SafetyMap.tsx, shared/publicView.ts, routes/public.ts | F06 |
| F20 | Resources (list, add, edit, allocate) | SHOULD | Admin | pages/admin/Resources.tsx, IncidentPage.tsx | F13 |
| F21 | Fake phone verification (OTP 123456) | SHOULD | Victim | pages/Track.tsx | F04 |
| F22 | Nearby hazard banner | SHOULD | Community | pages/PublicMap.tsx | F19 |
| F23 | Demo tools | MUST | Team | Layout.tsx dev buttons, `/api/dev/reset` | — |
| F24 | Live dictation while speaking (online only) | COULD | Victim | hooks/useLiveDictation.ts | F01 |
| F25 | Victim screens in Tamil and Hindi | SHOULD | Victim | src/i18n/ | F01, F02, F06, F19 |

**Out of scope (do not build):** victim accounts, volunteer self-registration, video upload, push notifications, real SMS, real calls or number masking, real emergency-service integration, offline admin/volunteer actions, multiple volunteers on one incident, undo merge, analytics, translating the staff (admin/volunteer) screens.

---

## 2. Feature specifications

### F01 — Emergency report form
**Goal:** anyone can report an emergency in under a minute, no login.
**Behaviour:**
1. Fields: description (textarea, placeholder "What happened? You can type or use the mic"), location, people count chips (`1`, `2–4`, `5–9`, `10+`, `Not sure` → values 1, 3, 7, 10, null), needs chips (multi-select `Need` values except OTHER shown as "Other"), one photo (camera or gallery), optional phone number.
2. Location: on page open call `getPosition()`; show "📍 Location captured (±N m)" or "Location not available" with a text field "Describe the location (street, landmark)". The text field is always visible and optional when GPS succeeds.
3. Photo is compressed with `compressImage` before storing (BR-04).
4. Submit button is enabled only when BR-03 is satisfied; otherwise show which part is missing.
5. On submit: generate `id`, `code`, `pin` (BR-01), attach `deviceId`, `createdAt`; call `outbox.enqueue`; navigate to `/report/sent/:id`. Never wait for the network.
6. Emergency banner "If you can call, call 112" visible at top.
**Acceptance:**
- [ ] Works with the network disabled (airplane mode) — submission lands in outbox.
- [ ] No map tiles or online resources are required on this page.
- [ ] Submit disabled with empty form; enabled with 5+ characters of text, or a voice note, or a selected need.

### F02 — Offline outbox & sync
**Goal:** reports are never lost; they send automatically when a connection exists.
**Behaviour:** implements BR-02. ReportSent page (S03) shows code and PIN large, a copy button, sync status badge (`Saved on this phone — will send automatically` / `Sending…` / `Sent ✓` / `Could not send: <message>`), a keyword preview card (F05 client part), and "Retry now". Home (S01) shows "You have N unsent reports" when outbox has queued items.
**Acceptance:**
- [ ] Airplane mode → submit → status "Saved on this phone". Turn network on → status becomes "Sent ✓" within 30 s without user action (app open).
- [ ] Submitting the same item twice (retry) creates only one report on the server.
- [ ] If server returns CODE_TAKEN, the displayed code changes to the new code and the report is sent.

### F03 — Voice note on report
**Goal:** a victim can speak instead of typing (Tamil, English or mixed).
**Behaviour:**
1. `VoiceRecorder` on S02 under the description: big button "🎤 Tap to speak". While recording: timer and "Tap to stop"; auto-stop at 60 s (BR-05).
2. After recording: "Voice note saved ✓ 0:24", ▶ Play, ✕ Delete. Only one voice note per report; recording again replaces it.
3. The voice note is stored in the outbox with the report as base64 + mime + seconds.
4. S03 preview card shows "Your voice note will be turned into text when it is sent" when a voice note exists.
5. If microphone permission is denied, show "Microphone blocked — you can use your keyboard's mic button instead" and keep the form usable.
**Acceptance:**
- [ ] Record while offline, submit, go online → admin sees audio player and transcript.
- [ ] Voice-only report (no text) can be submitted.

### F04 — Report tracking (code + PIN)
**Goal:** victim sees progress without an account.
**Behaviour:**
1. S04 form: code (6 chars, auto-uppercase) + PIN (4 digits). If opened with `?r=<reportId>` and that report is in the outbox, fill both automatically and load.
2. Shows a vertical stepper of `VictimStep` values in order RECEIVED → REVIEWING → VERIFIED → HELP_ASSIGNED → ON_THE_WAY → ARRIVED → RESOLVED; current step highlighted (BR-90). If CLOSED, show only the closed message (BR-91).
3. Shows public log messages (newest first) and "Last updated X min ago". Polls every `POLL_TRACK_MS`, and refreshes at once on a live change signal (architecture D12).
4. Wrong code or PIN → "Code or PIN not found. Check and try again."
5. If the report is still only in the outbox (not sent), show "This report hasn't been sent yet" with a Retry button.
6. Emergency banner visible.
**Acceptance:**
- [ ] After a merge, the victim's original code still shows the merged incident's progress.
- [ ] Steps change as admin/volunteer act (within one poll interval).

### F05 — AI structuring
**Goal:** free text or speech becomes a structured `Extraction`.
**Behaviour:**
- **Client (offline preview):** S03 runs `keywordExtractor(text)` and shows "Here's what we understood: Flood · 3 people · elderly person · trapped · Evacuation". Label it "Preliminary".
- **Server:** pipeline steps 1–4 in `architecture.md` §11.2 with rules BR-10…BR-13.
- **Admin view:** each report shows the original text, transcript (if any), audio player, extraction, and source badge "AI" or "Keywords".
**Acceptance:**
- [ ] Demo sentence 1 ("Water has entered our house. My grandmother cannot walk and we are stuck on the second floor. The road outside is completely flooded.") → type FLOOD, vulnerable true, trapped true, danger true, needs include EVACUATION. Must pass with **both** AI and keywords.
- [ ] AI model unavailable (e.g. removed from `models/`) → new reports still create incidents with source "Keywords".
- [ ] Whisper failure → report still becomes an incident; admin sees "🎤 Voice note could not be transcribed — listen".

### F06 — Incident creation & lifecycle
**Goal:** every processed report becomes an incident; incidents move through statuses.
**Behaviour:** creation per pipeline; status transitions and side effects per BR-100…BR-104. Every change writes an `incident_logs` row (BR-110).
**Acceptance:**
- [ ] Each state transition in the rules.md table works and invalid ones return INVALID_STATE.

### F07 — Duplicate detection & merge
**Goal:** multiple reports of the same event become one incident, with human confirmation.
**Behaviour:**
1. Detection per BR-40…BR-43 when a new incident is created.
2. Dashboard row shows tag "Possible duplicate of #CODE".
3. Incident page section "Possible duplicate": the other incident's code, type, summary, distance; buttons **Merge into #CODE** and **Not a duplicate**.
4. Merge opens a confirm modal: "Reports, assignments and resources from #A will move to #B. #A will be closed as merged." → Confirm → navigate to target incident page.
5. Merge behaviour per BR-50…BR-52.
**Acceptance:**
- [ ] Demo: second report creates incident with duplicate tag pointing to the first; merging gives 2 reports on the target and confidence ≈ 85 (BR-20 example).
- [ ] "Not a duplicate" clears the tag.

### F08 — Related incidents (cascade)
**Goal:** show how incidents connect (flood → road blocked → power outage).
**Behaviour:** incident page section "Related incidents" computed by `findRelated` (BR-45); each row: icon, code, type, text like "Road blocked · 600 m away · 30 min earlier"; click opens that incident. No buttons, nothing stored.
**Acceptance:**
- [ ] Demo flood incident lists the seeded ROAD_BLOCKED and POWER_OUTAGE incidents.

### F09 — Confidence score
**Goal:** show how reliable the information is, with reasons.
**Behaviour:** computed per BR-20…BR-22. Displayed as "Confidence 85% (High)" + `ReasonList`.
**Acceptance:** unit tests in rules.md examples pass.

### F10 — Priority score + override
**Goal:** show how urgent the incident is, with reasons; admin can override.
**Behaviour:** computed per BR-25…BR-28. Override modal: level select (LOW…CRITICAL or "Remove override") + reason (required when setting). Overridden badge shows "CRITICAL (set by admin)" and the reason.
**Acceptance:**
- [ ] Demo flood computes CRITICAL with reasons listed.
- [ ] Override persists after a new report is merged in.

### F11 — Staff login
**Goal:** admin and volunteers log in with seeded accounts.
**Behaviour:** S06 email + password + two quick buttons "Demo: Admin", "Demo: Volunteer (Ravi)" that fill credentials (visible only in DEV mode). After login redirect: ADMIN → `/admin`, VOLUNTEER → `/volunteer`. Logout button in Layout. Token kept in sessionStorage.
**Acceptance:**
- [ ] Volunteer cannot open `/admin` (redirected) and gets 403 from admin API.

### F12 — Admin dashboard
**Goal:** see what needs attention first.
**Behaviour:**
1. Counter cards 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low (counts of ACTIVE_STATUSES by effective priority).
2. Filters: status (All active / NEW / VERIFIED / IN_PROGRESS / RESOLVED / REJECTED), type.
3. Queue sorted per BR-120. Row: priority badge, code, type icon + label, location text, people, confidence %, status badge, report count, age ("12 min ago"), tags: `Possible duplicate of #X`, `Reassign`, `Ready to resolve`, `Escalation recommended`, `Escalated`, `🎤`.
4. Row click → S08. Polls every `POLL_ADMIN_MS`, and refreshes at once on a live change signal (architecture D12).
**Acceptance:**
- [ ] A new report appears within one poll interval after processing.

### F13 — Admin incident page
**Goal:** one place to understand and act on an incident.
**Sections (top to bottom):**
1. **Header:** code, type, status badge, priority badge (effective), confidence badge; buttons by status (BR-100): Verify, Reject, Override priority, Resolve, Edit.
2. **Why:** two columns — Priority reasons, Confidence reasons.
3. **Escalation (F18):** shown when recommended or escalated.
4. **Reports:** each `AdminReport` card (label, time, "sent while offline" if `receivedAt − createdAt > 2 min`, text, transcript, audio, photo, people, needs, phone + "verified" tick, extraction, source badge).
5. **Possible duplicate (F07)** and **Related incidents (F08)**.
6. **Response:** current assignment with status; or suggestions list (F14); history of previous assignments with reasons.
7. **Chats (F17):** read-only `ChatBox` per reporter thread.
8. **Resources (F20):** allocations + "Allocate" button.
9. **Log:** all logs, newest first.
**Modals:** Verify (optional "Public area name", prefilled with first `extraction.places` item), Reject (reason required), Edit (type, people, flags, needs, location text, public area, summary; also "Set pin on map" = current lat/lng numeric fields), Override, Resolve (note optional; warns "The active volunteer assignment will be cancelled" if one exists), Merge confirm, Assign confirm, Allocate, Escalate.
**Acceptance:**
- [ ] All buttons follow BR-100 availability (hidden or disabled when not allowed).
- [ ] Page polls every `POLL_ADMIN_MS` without losing open modal state.

### F14 — Volunteer suggestions & assignment
**Goal:** admin picks the right volunteer quickly; system only suggests.
**Behaviour:** suggestions per BR-60…BR-63 shown when the incident has no active assignment and status ∈ {NEW, VERIFIED}. Each card: name, score, distance, reasons ("✓ Swimming", "✓ Life jacket", "1.2 km away"), missing ("✗ Boat"). Button **Assign** → confirm modal (if incident NEW: "This incident is not verified yet. The volunteer may be going to check it.") → assignment ASSIGNED (BR-103). "Cancel assignment" button on an active assignment. **Send on WhatsApp** (added 2026-09-30): on an active assignment, a button opens WhatsApp on the coordinator's device with the volunteer's number and a ready message (incident type, priority, code, area, link to the volunteer's assignment page); the coordinator presses Send. It uses a `wa.me` link, so there's no API, account or cost. The message never contains the victim's name, phone or report text. Hidden when the volunteer has no phone number (`src/lib/whatsapp.ts`).
**Acceptance:**
- [ ] Demo: Ravi is ranked first for the flood incident.
- [ ] After assigning, "Send on WhatsApp" opens WhatsApp with the volunteer's number and the message (needs a phone number on the volunteer's profile).
- [ ] BUSY volunteers and volunteers who declined this incident never appear.

### F15 — Volunteer assignment workflow
**Goal:** volunteer receives, accepts and progresses through the response.
**Behaviour:**
1. S09 Volunteer home: availability toggle (F16); "New assignment" card for ASSIGNED (type, summary, people, flags, distance, priority) with **Accept** / **Decline** (decline modal: reason select `UnableReason` + optional text); "Current assignment" card for other active statuses → opens S10; "Recent" list (last 5 finished).
2. S10 Assignment page: incident summary, needs, flags, location text, "Open in Maps" link (`https://www.google.com/maps?q=lat,lng`), status stepper, one primary button for the next step (`On my way` → EN_ROUTE, `I've arrived` → ON_SITE, `Helping now` → ASSISTING, `Done` → DONE), secondary **Unable to continue** (reason modal). Chat section (F17).
3. Transitions and side effects per BR-104.
**Acceptance:**
- [ ] Demo: accept → on my way → arrived → done; admin and victim views update within one poll.
- [ ] Unable → incident shows "Reassign" tag and suggestions reappear.

### F16 — Volunteer availability & profile
**Behaviour:** toggle AVAILABLE / OFFLINE on S09 (BUSY is set only by the system, BR-104; toggle disabled while BUSY). Small "My skills" panel on S09 with an Edit modal for skills, equipment, vehicle and "Use my current location" for base location.
**Acceptance:** [ ] OFFLINE volunteers are not suggested.

### F17 — Private volunteer ↔ victim chat
**Goal:** direct contact without revealing phone numbers or names.
**Behaviour:**
1. Opens when the incident's active assignment is ACCEPTED/EN_ROUTE/ON_SITE/ASSISTING (BR-70…BR-73).
2. Victim (S04): section "Your volunteer" with `ChatBox`. Labels: messages from the volunteer show as "Volunteer", own as "You".
3. Volunteer (S10): one thread per report of the incident, tabs "Reporter 1", "Reporter 2" (ordered by report `received_at`).
4. Admin (S08): read-only threads.
5. Quick replies — victim: "📍 Share my location", "We are on the 2nd floor", "Water is rising", "Someone needs medical help", "Please hurry". Volunteer: "I'm 5 minutes away", "Stay where you are", "Wave a cloth or torch from the window", "Can you reach the roof?", "I've arrived — where are you?".
6. "Share my location" gets GPS and sends a message with lat/lng; volunteer sees "📍 Location shared — Open in Maps".
7. Voice messages: small mic in ChatBox using `VoiceRecorder` (max 60 s).
8. Chat polls every `POLL_CHAT_MS` (and refreshes on a live change signal, architecture D12); on a new incoming message the page vibrates (`navigator.vibrate(200)`) and plays a short beep.
9. When closed: history visible, input replaced by "Chat closed".
10. Offline: sending shows "You're offline — message not sent" and keeps the typed text.
**Acceptance:**
- [ ] No phone number or name appears anywhere in victim or volunteer chat views or API responses.
- [ ] Sending after DONE/RESOLVED returns CHAT_CLOSED.

### F18 — Escalation (simulated)
**Behaviour:** per BR-30…BR-32. Panel "⚠ Emergency escalation recommended" with reasons and button **Escalate to emergency services (simulated)** → modal with optional note → shows "Escalated (simulated) at 10:42". Admin can also escalate when not recommended (button in header menu).
**Acceptance:** [ ] Demo flood shows the recommendation.

### F19 — Public safety map
**Goal:** community sees hazards safely.
**Behaviour:**
1. S05 map centred on the user's location if available, else on the demo centre; markers colored per BR-83 with emoji icons by type.
2. Toggle Map / List. Automatic list mode when tiles fail to load or device is offline.
3. Tap marker/list item → card: type label, area (or "Approximate location"), status label (ACTIVE "Active", RESPONDING "Help on the way", RESOLVED "Resolved"), priority, "Confidence: High/Medium/Low", "Verified" or "Unverified" tag, report count, "Updated X min ago", advice.
4. Legend. Polls every `POLL_PUBLIC_MS`.
5. Data comes only from `/api/public/incidents` (BR-80…BR-84).
**Acceptance:**
- [ ] The public API response contains none of: report text, transcript, phone, photo/audio URL, names, `location_text`, exact coordinates (only 3 decimals).
- [ ] Resolving an incident turns its marker green within one poll interval.

### F20 — Resources
**Behaviour:** S11 table (name, category, available quantity, unit, location) + "Add resource" modal + edit quantity inline. On incident page: "Allocate" modal (resource select showing available, quantity) → BR-130. Allocations list on incident page.
**Acceptance:** [ ] Allocating 50 of 200 water shows 150; allocating more than available shows "Only N available".

### F21 — Fake phone verification
**Behaviour:** on S04 when `phoneVerified` is false: "Verify your phone (optional)" → phone input → "Send code" (no SMS; shows hint "Demo code: 123456" in DEV mode) → code input → verify (BR-140).
**Acceptance:** [ ] After verifying, the incident's confidence gains the phone reason (+5) within one poll.

### F22 — Nearby hazard banner
**Behaviour:** on S05, if location is available: "⚠ N active hazards within 2 km" when N > 0 (RED + ORANGE markers within `NEARBY_RADIUS_M`); tapping it switches to list filtered to those.
**Acceptance:** [ ] Banner hidden when location denied or N = 0.

### F23 — Demo tools
**Behaviour:** in DEV builds, Layout shows a small floating "Demo" menu with "Reset demo data" (calls `/api/dev/reset`, server `DEV_MODE` only) and "Simulate offline".
**Acceptance:** [ ] "Reset demo data" restores the §12 seed via the server.

### F24 — Live dictation (optional)
**Behaviour:** if `SpeechRecognition` exists and the device is online, show a small "✍️ Live text" toggle next to the mic; recognized words are appended to the description while recording (starts in the app's language: `en-IN`, `ta-IN` or `hi-IN`, with a switch). The recorded voice note is still attached. Hide entirely when unsupported or offline.
**Acceptance:** [ ] Absence of this feature never breaks F03.

### F25 — Regional languages (Tamil, Hindi)
**Behaviour:** a language picker (English / தமிழ் / हिन्दी) in the header of every public page. The choice is saved on the device; the first visit follows the browser language. Home, Report, Report sent, Track, Safety map and the victim chat are translated, including server update lines, map advice and common error messages (translated on the phone from the known English text). Admin and volunteer screens always stay English. Voice notes in any Whisper-supported Indian language are transcribed and also translated to English for the AI (BR-12); typed Hindi is understood by the keyword fallback (BR-10).
**Acceptance:**
- [ ] Choosing தமிழ் or हिन्दी changes every victim screen with no English left, and survives a reload.
- [ ] Admin pages stay English on a device set to Tamil.
- [ ] A Hindi voice note produces a Hindi transcript plus an English line, and a structured incident.
- [ ] Offline preview on "Report sent" works for a typed Hindi report.

---

## 3. Screens

| ID | Route | Screen | User | Features |
|---|---|---|---|---|
| S01 | `/` | Home | Everyone | F01, F02 |
| S02 | `/report` | Report | Victim | F01, F03, F24 |
| S03 | `/report/sent/:id` | Report sent | Victim | F02, F05 (preview) |
| S04 | `/track` | Track | Victim | F04, F17, F21 |
| S05 | `/map` | Public map | Community | F19, F22 |
| S06 | `/login` | Login | Staff | F11 |
| S07 | `/admin` | Dashboard | Admin | F12 |
| S08 | `/admin/incidents/:id` | Incident page | Admin | F07, F08, F09, F10, F13, F14, F17, F18, F20 |
| S09 | `/volunteer` | Volunteer home | Volunteer | F15, F16 |
| S10 | `/volunteer/assignments/:id` | Assignment | Volunteer | F15, F17 |
| S11 | `/admin/resources` | Resources | Admin | F20 |

**S01 Home layout:** app name; huge red button "🚨 REPORT EMERGENCY" + "No account needed · works offline"; buttons "Track my report", "Safety map"; unsent-report notice; emergency banner; small "Staff login" link at the bottom.

**Navigation:** Home → Report → Report sent → (Track | Home). Home → Track. Home → Map. Login → Dashboard → Incident page (→ other incidents via duplicate/related links) ; Dashboard ↔ Resources. Login → Volunteer home → Assignment → back.

**Design rules:** victim, volunteer and map screens are mobile-first (360 px wide); admin screens desktop-first (≥ 1024 px) but usable on tablet. Large touch targets (≥ 44 px) on victim screens. Every data screen has loading, empty and error states.

---

## 4. Demo scenario (end-to-end acceptance test)

Setup: `/api/dev/reset` (or "Reset demo data"). Phone A = victim 1, Phone B = victim 2, Laptop tab 1 = admin, Phone C or laptop tab 2 = volunteer Ravi.

| Step | Action | Expected result |
|---|---|---|
| 1 | Phone A in **airplane mode** opens app → Report → records voice: "Flood water has entered our house. My grandmother cannot walk and we are stuck upstairs." → Submit | Code + PIN shown; "Saved on this phone"; preview says voice note will be converted |
| 2 | Phone A turns airplane mode off | "Sent ✓" within 30 s |
| 3 | Admin dashboard | New FLOOD incident appears (CRITICAL, with 🎤 tag); incident page shows audio, transcript, extraction (vulnerable, trapped, evacuation), source AI |
| 4 | Phone B reports by text: "Several people are trapped near Central Street" + photo + phone number, then verifies phone with 123456 on Track page | New incident appears with tag "Possible duplicate of #<first>" |
| 5 | Admin opens it → Merge | Target shows 2 reports, confidence ≈ 85 (High) with reasons, priority CRITICAL with reasons, escalation recommended, related incidents: road blocked + power outage |
| 6 | Admin → Verify (public area "Central Street") → Escalate (simulated) | Status VERIFIED; log entries; public map shows red marker "Central Street", Verified |
| 7 | Admin sees suggestions → Ravi first ("✓ Swimming ✓ First aid ✓ Life jacket · 1.2 km") → Assign | Ravi's phone shows new assignment |
| 8 | Ravi → Accept → "On my way" | Phone A Track: "Help is on the way"; chat opens; map: "Help on the way" |
| 9 | Phone A → quick reply "📍 Share my location" + "We are on the 2nd floor"; Ravi replies "I'm 5 minutes away" | Messages visible on both sides and read-only for admin; no phone numbers anywhere |
| 10 | Ravi → "I've arrived" → "Done" | Dashboard tag "Ready to resolve"; victim: "Help has arrived" |
| 11 | Admin → Allocate 20 drinking water → Resolve | Map marker turns green "Resolved"; Phone A and B Track show Resolved; chat closed |

Extra checks: make the AI model unavailable and repeat step 4 → incident still created with "Keywords"; block map tiles → list view.
