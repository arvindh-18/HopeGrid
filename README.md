# HopeGrid

Hyperlocal disaster preparedness and community response platform: offline-first emergency reporting without login, explainable confidence and priority, coordinator verification and assignment, volunteer response with private chat, and a public safety map.

Specs: `docs/architecture.md`, `docs/features.md`, `docs/rules.md`, `docs/DESIGN.md`.

## Current state

| Part | State |
|---|---|
| Frontend (`src/`) | All screens S01–S11, connected to the real API through `src/data/realApi.ts` |
| Shared rules (`shared/`) | Implemented and tested (22 tests) |
| Backend (`server/`, `supabase/`) | All API routes in architecture.md §8, report pipeline (Whisper → local LLM → keyword fallback, all running inside the server), seed + demo reset |

Details and assumptions from the UI phase: `UI_SKELETON_STATUS.md`.

## Run

```bash
npm install
npm run dev        # web on http://localhost:5173 + API server on http://localhost:3000
npm test           # business-rule tests
npm run build      # typecheck + production build + service worker
npm run preview    # serve the production build
npm start          # API server serving the production build (dist/)
npm run tunnel     # public HTTPS link to :3000 for phones
```

Requires Node.js 22.12+. **Nothing else to install**: the local AI (Qwen 2.5 3B via node-llama-cpp), speech-to-text (whisper.cpp) and ffmpeg all come from npm and run inside the server. Only the laptop that hosts the server needs the AI models (`npm run setup-ai`); phones and other devices just open the website.

First-time setup:

1. `npm install`: installs the code only (small, no models).
   - **Server laptop only:** `npm run setup-ai` downloads the AI and speech models into `models/` (about 2.5 GB, once). Without them the app still works: reports are structured by the keyword fallback and voice notes are left for staff to listen to.
2. Run `supabase/schema.sql` once in the Supabase SQL editor, and fill in `.env` (see `.env.example`).
3. `npm run seed` creates the staff accounts and demo data.
4. In Supabase Auth settings, set JWT expiry to 86400 s so staff sessions last the whole demo.

Demo on phones: `npm run build && npm start`, then `npm run tunnel` in a second terminal and open the printed `https://…trycloudflare.com` link (HTTPS is needed for GPS and the microphone).

In dev builds, the lime **Demo** button can reset demo data (`/api/dev/reset`) or simulate offline.

Seeded staff accounts (architecture.md §12, created by the server seed script): `admin@demo.app`, `ravi@demo.app`, password `Demo@123`.

## Structure

```
hopegrid/
├── docs/                 specs (architecture, features, rules, design)
├── shared/               types, constants and business rules used by frontend and server
├── src/
│   ├── data/             Api interface (index.ts), realApi (fetch /api/*)
│   ├── offline/          outbox queue, device id, online state
│   ├── components/ hooks/ lib/ pages/
├── tests/                rule tests (vitest)
├── public/               PWA icon
├── server/               Express API (Supabase via service role)
├── supabase/             schema.sql (run once in the Supabase SQL editor)
└── models/               AI + speech models, downloaded by npm run setup-ai (gitignored)
```

## How the frontend reaches the backend

Pages only call `src/data/index.ts` (`api`), which is backed by `src/data/realApi.ts` (fetch to `/api/*`). In development, Vite proxies `/api` to `http://localhost:3000`. In demo mode, `npm start` serves both the API and the built app from port 3000.
