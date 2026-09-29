# TODO — open items for the owner

Items still open from the build sessions (up to 2026-09-29). Tick each box when done.
Background for every item is in [`PROJECT.md`](PROJECT.md).

---

## 🔴 Do first (before committing or demoing)

### Git
- [ ] **Commit the current work.** Local `main` has a merge commit (`test` → `main`) plus uncommitted work: languages,
      Hindi keywords, voice translation, `PROJECT.md`, `TODO.md`.
      `git add -A` → `git commit -m "..."` → `git push origin main`
- [ ] **Remove the `.DS_Store` files from git.** They were committed in "Backend and AI". `.gitignore` now excludes them,
      but they stay tracked until removed:
      `git rm --cached .DS_Store server/.DS_Store src/.DS_Store`
- [ ] **Decide on the old branches.** Keep or delete `test` and `test-push`, locally and on GitHub. All their work is now in `main`.

### Database (Supabase)
- [ ] **Finish the manual incident cleanup.** Leftovers: `PW7NX`, `RB4KT`, `FR2QH` (seed incidents whose reports were
      deleted) and `RPUXR` (orphan). Delete child rows first: messages → assignments → allocations → incident_logs →
      reports → incidents. Otherwise Supabase refuses with a foreign-key error.
- [ ] **Restore the demo data:** `npm run seed`. Resources are currently **0**. ⚠️ This deletes everything else in the database.
- [ ] Check whether the report you submitted earlier ("I don't see it in Supabase") is still stuck in your phone or
      browser outbox. Open the app on that device; Home shows "unsent reports" if it is.

### Running the app
- [ ] **Restart the dev server.** Stop the old Vite still running on port 5173 (started 09:26), then run `npm run dev`.
      It predates the package changes and the new language files.
- [ ] Confirm the server log shows **"AI model ready"** and **"Speech model ready"** on the laptop that will host the demo.
      If not, run `npm run setup-ai` there, once, about 2.5 GB.

---

## 🟠 Before the demo

### Languages (F25)
- [ ] **Have a native Tamil speaker read `src/i18n/ta.ts`** and a native Hindi speaker read `src/i18n/hi.ts`.
      The translations were written without a native review.
- [ ] Test the language picker on a real Android phone and a real iPhone: fonts, text fitting in buttons, choice
      remembered after reload.
- [ ] **End-to-end voice test on a phone in Hindi and in Tamil:** record → send → admin incident shows the original
      transcript + an "English:" line + sensible type and flags. So far only tested on the laptop with synthetic voices.
- [ ] Test a **typed** Hindi report while offline: "Report sent" should show a sensible preview (keywords).
- [ ] Decide what to say in the pitch about typed Tamil/Hindi: the 3B AI is weaker there; the form choices and
      keywords compensate.

### Demo run-through
- [ ] Full demo script from `docs/features.md` §4 on the real demo laptop + 2 phones via `npm run tunnel` (HTTPS link).
- [ ] Backup check: `AI_MODEL=none npm start` → reports still become incidents, labelled "Keywords".
- [ ] Record a backup video of the full run.
- [ ] Laptop: plugged in, sleep off, phone hotspot ready as a backup internet connection.

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
      Whisper-small already handles speech in about 13 Indian languages; **Odia is not supported**.
- [ ] Safety net for AI misses: let keyword flags from the original text (trapped, vulnerable, medical) *raise* the AI's
      flags, never lower them. Needs a rules change in `docs/rules.md`.
- [ ] Better AI for Indian languages if the server laptop has 16 GB RAM: `AI_MODEL=hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M` (~4.7 GB).
- [ ] Better Tamil/Hindi speech: try Whisper `large-v3-turbo` (quantised, ~550 MB) via `WHISPER_MODEL`.
- [ ] Real SMS OTP and real emergency-service escalation (currently simulated).
