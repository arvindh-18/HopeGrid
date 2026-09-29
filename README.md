# HopeGrid

Hyperlocal disaster preparedness and community response platform: offline-first emergency reporting without login, explainable confidence and priority, coordinator verification and assignment, volunteer response with private chat, and a public safety map.

Specs: `docs/architecture.md`, `docs/features.md`, `docs/rules.md`, `docs/DESIGN.md`.

## Current state

| Part | State |
|---|---|
| Frontend (`src/`) | Complete UI skeleton. Calls `realApi`, whose functions are still stubs, so screens show "server is not connected" until the backend exists |
| Shared rules (`shared/`) | Implemented and tested (22 tests) |
| Backend (`server/`, `data/`) | Empty placeholder files. Not implemented yet |

Details, assumptions and per-feature integration points: `UI_SKELETON_STATUS.md`.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api to http://localhost:3000)
npm test           # business-rule tests
npm run build      # typecheck + production build + service worker
npm run preview    # serve the production build
```

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
├── server/               EMPTY placeholders for the backend
├── data/                 EMPTY placeholders (schema.sql, seed.sql, seed.json, db.json, uploads/)
└── models/               local AI/speech model files (gitignored)
```

## Connecting the backend

Pages only call `src/data/index.ts`. When the backend exists, replace the stubs in `src/data/realApi.ts` (each names its endpoint). The dev server already proxies `/api` to `http://localhost:3000`.

**Note:** the placeholder backend layout (`server/db.ts`, `data/db.json`, `data/schema.sql`, `routes/auth.ts`) follows an earlier JSON-database plan. The current `docs/architecture.md` (v3) uses Supabase with `supabase/schema.sql`, `server/supabase.ts`, `storage.ts`, `mappers.ts`, `routes/authRoutes.ts`, `routes/dev.ts` and `server/scripts/seed.ts`. Decide which layout to follow before starting backend work.
