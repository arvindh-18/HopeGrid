# TODO — open items for the owner

Items still open from the build sessions (up to 2026-09-29). Tick each box when done.
Background for every item is in `PROJECT.md` (kept in ~/Downloads) and in `CHANGES.md` for the score-raising pass.

---

## 🔴 Do first (before committing or demoing)

### Git
- [ ] **Review and commit the score-raising pass** (see `CHANGES.md`): security fixes, the API tests (98 tests in total now), the AI
      evaluation, the processing queue, the clean-up script and the new docs. Nothing has been committed.
- [ ] **Rotate both Supabase keys now** (Project Settings → API Keys). The real keys are in the public git history
      (commits `962d3d2`, `6ccb65a`, `0197709`) even though `.env.example` now has placeholders. Then update `.env`.
- [ ] **Remove the `.DS_Store` files from git.** They were committed in "Backend and AI". `.gitignore` now excludes them,
      but they stay tracked until removed:
      `git rm --cached .DS_Store server/.DS_Store src/.DS_Store`
- [ ] **Decide on the old branches.** Keep or delete `test` and `test-push`, locally and on GitHub. All their work is now in `main`.

### Database (Supabase)
- [ ] **Run `supabase/schema.sql` again in the Supabase SQL Editor** (new: volunteer registration). It only creates the
      `volunteer_applications` table; nothing existing is changed or deleted. Until then `/volunteer/register` can't
      save applications and **Volunteers** in the admin menu shows an error.
- [ ] **Try volunteer registration once on the real database:** register a test volunteer at `/volunteer/register` →
      log in (should say "waiting for approval") → approve under **Volunteers** → log in again (volunteer home). Then
      register a second one and reject it; check the user disappears under Supabase → Authentication → Users.
- [ ] **Finish the manual incident cleanup.** Leftovers: `PW7NX`, `RB4KT`, `FR2QH` (seed incidents whose reports were
      deleted) and `RPUXR` (orphan). Delete child rows first: messages → assignments → allocations → incident_logs →
      reports → incidents. Otherwise Supabase refuses with a foreign-key error.
- [ ] **Restore the demo data:** `npm run seed`. Resources are currently **0**. ⚠️ This deletes everything else in the database.
- [ ] Check whether the report you submitted earlier ("I don't see it in Supabase") is still stuck in your phone or
      browser outbox. Open the app on that device; Home shows "unsent reports" if it is.

- [ ] **Run `supabase/schema.sql` again for reports by SMS (F27).** It adds `channel`, `pending_media` and
      `completed_at` to `reports` (safe to re-run; nothing is deleted). Until then the server prints a warning at
      startup and the coordinator dashboard can't load.

### Community help (F29)
- [ ] **Run `supabase/schema.sql` again** (adds the `help_offers` table and `incidents.open_to_all` / `public_task`),
      then restart `npm start`.
- [ ] Try it: verify a test incident, then on a phone open the map → the hazard → "Offer help"; accept it on the
      incident page. Then "Open to anyone" with a task and join from the map. Log in as a volunteer and "take" another.

### Auto-dispatch (F28)
- [ ] **Run `supabase/schema.sql` again** (adds `assignments.auto` / `respond_by`, `incidents.auto_dispatched_at`,
      `profiles.push_token` and the `settings` table). Then restart `npm start`.
- [ ] On the dashboard, try **Auto-dispatch → Always** with one test report: the volunteer phone should show the SOS
      screen and get the SOS SMS; answer YES by SMS.
- [ ] Optional push: create the Firebase project (README → "Auto-dispatch and SOS"), add `google-services.json` and
      the service-account key, `npm run app:apk`, and check an SOS arrives with the app closed.

### Reports by SMS (F27)
- [ ] Get an Android phone with a SIM for the gateway. Install "SMS Gateway for Android" and switch on Local Server.
- [ ] Fill in `.env`: `VITE_SMS_NUMBER` (the gateway's number), and `SMS_GATEWAY_URL` / `_USER` / `_PASSWORD` from
      the app. `SMS_WEBHOOK_SECRET` is already generated: paste the same value into the app (Settings → Webhooks →
      Signing Key). On Vercel, add `VITE_SMS_NUMBER` under Environment Variables.
- [ ] `npm start`, then `npm run sms:connect` (or `-- --usb` with a cable). Rebuild: `npm run build`, `npm run app:apk`.
- [x] Plain-words SMS from another phone → incident + reply (worked 2026-09-30, Xiaomi gateway on USB).
- [ ] A "Send by SMS" report from the rebuilt app with mobile data off, then turn data on and check the photo/voice
      note join the same report.

### Running the app
- [ ] **Restart the dev server.** Stop the old Vite still running on port 5173 (started 09:26), then run `npm run dev`.
      It predates the package changes and the new language files.
- [ ] Confirm the server log shows **"AI model ready"** and **"Speech models ready: Whisper, Parakeet English,
      IndicConformer Tamil, IndicConformer Hindi"** on the laptop that will host the demo. If any is missing, run
      `npm run setup-ai` there (about 3.3 GB the first time; it keeps files already downloaded).

---

## 📱 Android app
- [ ] Install `HopeGrid.apk` on a real Android phone and run through `HopeGrid-App-Guide.pdf` once: server
      address, map, voice note, **photo from the camera** (not tested in the emulator), and a volunteer assignment.
- [ ] Decide whether to commit `android/` (53 files, ~340 KB; builds and the APK are git-ignored).
- [ ] Optional: a fixed server address (ngrok static domain or a Cloudflare domain), so phones never need a new address.
- [ ] iOS: needs Xcode + an Apple Developer account; not set up.

## 🟠 For the judges (only you can do these)
- [ ] **Fill in the hackathon track** in `docs/problem.md` (top of the file).
- [ ] **Run one tabletop exercise with real people** (plan and feedback template in `docs/impact-and-deployment.md`
      §6–7) and fill in the **[TO FILL]** rows. This is the biggest missing piece of evidence.
- [ ] **Record a demo video** and link it in `docs/impact-and-deployment.md` §8.
- [ ] **Choose a licence** (e.g. MIT or AGPL-3.0) and add a `LICENSE` file. `docs/comparison.md` currently says "no licence
      file yet".
- [ ] **Know the model licences** (README → First-time setup). The AI model, Qwen 2.5 **3B**, is under the Qwen Research
      License (research and non-commercial use). Fine for a hackathon; a real deployment should switch to an
      Apache-2.0 size (1.5B, or 7B with 16 GB RAM, `AI_MODEL=…`) and re-run `eval/run.ts`. Parakeet (CC-BY-4.0) needs
      credit to NVIDIA, as the README gives.
- [ ] Approach one candidate partner (DDMA, NGO or college NSS unit) and record the outcome, not the plan.

## 🟠 Before the demo

### Languages (F25)
- [ ] **Have a native Tamil speaker read `src/i18n/ta.ts`** and a native Hindi speaker read `src/i18n/hi.ts`.
      The translations were written without a native review.
- [ ] Test the language picker on a real Android phone and a real iPhone: fonts, text fitting in buttons, choice
      remembered after reload.
- [ ] **End-to-end voice test on a phone in Hindi and in Tamil:** record → send → admin incident shows the original
      transcript (Tamil or Devanagari script) + an "English:" line + sensible type and flags. The speech engines are
      measured on real FLEURS recordings (docs/evaluation.md §5b), but not yet through a phone's microphone.
- [ ] **Record your own clips** (`npm run eval:asr -- record ta|hi|en`, then `compare`): stressed speech, real
      background noise and Tamil/Hindi mixed with English words are still untested.
- [ ] Test a **typed** Hindi report while offline: "Report sent" should show a sensible preview (keywords).
- [ ] Decide what to say in the pitch about typed Tamil/Hindi: the 3B AI is weaker there; the form choices and
      keywords compensate.

### WhatsApp button
- [ ] Put your teammates' **real** phone numbers on the volunteer profiles in Supabase (Table Editor → `profiles` → `phone`,
      e.g. `+919840012345`). Seeded volunteers have none, so the button says "No phone number". Or let teammates
      register at `/volunteer/register` and approve them: registered volunteers always have a phone number.
- [ ] Try it once: assign a volunteer → **Send on WhatsApp** → WhatsApp opens with the message → Send.

### Demo run-through
- [ ] Full demo script from `docs/features.md` §4 on the real demo laptop + 2 phones via `npm run tunnel` (HTTPS link).
- [ ] Backup check: `AI_MODEL=none npm start` → reports still become incidents, labelled "Keywords".
- [ ] Record a backup video of the full run.
- [ ] Laptop: plugged in, sleep off, phone hotspot ready as a backup internet connection.

### Checks that still need a real device or service
- [ ] **Record a voice note on an iPhone (Safari)** and submit it. The new upload check accepts MP4 by its "ftyp" header;
      it was verified with Chrome's real recordings, but not with Safari.
- [ ] **Try `/api/dev/reset` through a real `npm run tunnel` link** and confirm it answers 403 (tested with the headers a
      tunnel adds, not with a live tunnel).
- [ ] **Check live updates through a real tunnel:** open the coordinator dashboard and a tracking page on two phones via
      `npm run tunnel`, change the incident, and confirm both update within a second. If the tunnel buffers the
      streams, the screens fall back to normal polling.
- [ ] Decide whether to add **rate limiting** after all: without it, the 4-digit tracking PIN can be guessed by repeated
      requests (docs/scaling.md, PROJECT.md §15).
- [ ] Prefer a **16 GB laptop** for the server: with 8 GB the models caused heavy swapping in testing.

### Guides and docs
- [ ] **Regenerate the Feature Guide PDF** (`../HopeGrid-Feature-Guide.pdf`). It doesn't include F25 languages or the
      voice translation. The Run Guide was updated for `npm run setup-ai` but also doesn't mention languages.
- [ ] Update or delete **`UI_SKELETON_STATUS.md`**. It describes an old phase ("no server", 22 tests) and could confuse
      people and AI tools.
- [ ] Add a short "Languages" paragraph to `README.md` (picker, which screens, staff stay English).

---

## 🟡 After the hackathon / nice to have

### Security
- [ ] **Rotate the Supabase keys.** The real anon and service-role keys are in `.env.example`, which is committed to a
      public GitHub repo (accepted for the hackathon). In Supabase: Project Settings → API Keys → roll both, then update `.env`.
- [ ] Replace the real values in `.env.example` with placeholders (`SUPABASE_URL=https://xxxx.supabase.co`, etc.).

### Database
- [ ] Optional schema change: add `ON DELETE CASCADE` to the foreign keys (reports, logs, assignments, messages,
      allocations → incidents) so deleting an incident in the Supabase dashboard just works. Needs a migration in
      `supabase/schema.sql`, run in the SQL editor.

### Machine cleanup (this Mac)
- [ ] Stop the unused Ollama service: `brew services stop ollama`.
- [ ] Optionally remove the old Homebrew tools no longer used by HopeGrid:
      `brew uninstall ollama whisper-cpp cloudflared` (keep `ffmpeg` if you use it elsewhere).

### Features and quality ideas
- [ ] More languages: Telugu, Kannada, Malayalam, Bengali, Marathi… Copy `src/i18n/hi.ts`, add keywords + tests.
      Whisper's language list includes 14 languages used in India (not Odia, Kashmiri, Konkani, Maithili, Manipuri,
      Santali or Dogri); being in the list doesn't mean good accuracy with the small model — measure first.
- [ ] Safety net for AI misses: let keyword flags from the original text (trapped, vulnerable, medical) *raise* the AI's
      flags, never lower them. Needs a rules change in `docs/rules.md`.
- [ ] Better AI for Indian languages if the server laptop has 16 GB RAM: `AI_MODEL=hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M` (~4.7 GB).
- [ ] Better English version of Tamil voice notes: the 3B AI's Tamil → English is weak (chrF ~27 even from a perfect
      transcript, docs/evaluation.md §5b). AI4Bharat's IndicTrans2 (MIT, distilled 200M) is built for this but needs a
      new runtime dependency (onnxruntime-node) and an ONNX export — ask before adding.
- [ ] Measure English on Indian-accented speech: AI4Bharat's Svarah test set needs a Hugging Face login (gated).
      Parakeet vs Whisper was measured on FLEURS (US speakers) and on synthetic en-IN voices only.
- [ ] Real SMS OTP and real emergency-service escalation (currently simulated).
