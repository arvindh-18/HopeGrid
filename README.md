# HopeGrid

Hyperlocal disaster preparedness and community response platform: offline-first emergency reporting without login, explainable confidence and priority, coordinator verification and assignment, volunteer response with private chat, and a public safety map.

Specs: `docs/architecture.md`, `docs/features.md`, `docs/rules.md`, `docs/DESIGN.md`.

## Current state

| Part | State |
|---|---|
| Frontend (`src/`) | Complete UI skeleton. Calls `realApi`, whose functions are still stubs, so screens show "server is not connected" until the backend exists |
| Shared rules (`shared/`) | Implemented and tested (22 tests) |
| Backend (`server/`, `supabase/`) | F01 done: `POST /api/reports` (validation, idempotency, media upload). Other routes not implemented yet |

Details, assumptions and per-feature integration points: `UI_SKELETON_STATUS.md`.

## Run

```bash
npm install
npm run dev        # web on http://localhost:5173 + API server on http://localhost:3000
npm test           # business-rule tests
npm run build      # typecheck + production build + service worker
npm run preview    # serve the production build
npm start          # API server serving the production build (dist/)
```

Requires Node.js 22.12+. Before the first run: run `supabase/schema.sql` once in the Supabase SQL editor and fill in `.env` (see `.env.example`).

In dev builds, the lime **Demo** button can reset demo data (`/api/dev/reset`) or simulate offline.

Seeded staff accounts (architecture.md §12, created by the server seed script): `admin@demo.app`, `ravi@demo.app`, password `Demo@123`.

## Structure

```
hopegrid/
├── docs/                 specs (architecture, features, rules, design)
├── shared/               types, constants and business rules used by frontend and future server
├── src/
│   ├── data/             Api interface (index.ts), realApi (stubs until the backend exists)
│   ├── offline/          outbox queue, device id, online state
│   ├── components/ hooks/ lib/ pages/
├── tests/                rule tests (vitest)
├── public/               PWA icon
├── server/               Express API (Supabase via service role)
├── supabase/             schema.sql (run once in the Supabase SQL editor)
└── models/               local AI/speech model files (gitignored)
```

## Connecting the backend

Pages only call `src/data/index.ts`. When the backend exists, replace the stubs in `src/data/realApi.ts` (each names its endpoint). The dev server already proxies `/api` to `http://localhost:3000`.
