# HopeGrid

Hyperlocal disaster preparedness and community response platform: offline-first emergency reporting without login, explainable confidence and priority, coordinator verification and assignment, volunteer response with private chat, and a public safety map.

Specs: `docs/architecture.md`, `docs/features.md`, `docs/rules.md`, `docs/DESIGN.md`.

## Current state

| Part | State |
|---|---|
| Frontend (`src/`) | Complete UI skeleton, runs end to end on mock data |
| Shared rules (`shared/`) | Implemented and tested (22 tests) |
| Backend (`server/`, `data/`) | Empty placeholder files. Not implemented yet |

Details, assumptions and per-feature integration points: `UI_SKELETON_STATUS.md`.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (mock mode, no server needed)
npm test           # business-rule tests
npm run build      # typecheck + production build + service worker
npm run preview    # serve the production build
```

Use the lime **Demo** button to reset data, inject a second victim report, switch between Coordinator and Volunteer (Ravi), simulate offline, or force the next request to fail.

Demo accounts (mock mode accepts them from the login screen chips): `admin@demo.app`, `ravi@demo.app`, password `Demo@123`. Demo report to track: code `RB7K2M`, PIN `1111`.

## Structure

```
hopegrid/
├── docs/                 specs (architecture, features, rules, design)
├── shared/               types, constants and business rules used by frontend and future server
├── src/
│   ├── data/             Api interface (index.ts), mockApi + mockData (now), realApi stubs (later)
│   ├── offline/          outbox queue, device id, online state
│   ├── components/ hooks/ lib/ pages/
├── tests/                rule tests (vitest)
├── public/               PWA icon
├── server/               EMPTY placeholders for the backend
├── data/                 EMPTY placeholders (schema.sql, seed.sql, seed.json, db.json, uploads/)
└── models/               local AI/speech model files (gitignored)
```

## Mock → real switch

Pages only call `src/data/index.ts`. When the backend exists, replace the stubs in `src/data/realApi.ts` (each names its endpoint) and set `VITE_USE_MOCK=false`. The dev server already proxies `/api` to `http://localhost:3000`.

**Note:** the placeholder backend layout (`server/db.ts`, `data/db.json`, `data/schema.sql`, `routes/auth.ts`) follows an earlier JSON-database plan. The current `docs/architecture.md` (v3) uses Supabase with `supabase/schema.sql`, `server/supabase.ts`, `storage.ts`, `mappers.ts`, `routes/authRoutes.ts`, `routes/dev.ts` and `server/scripts/seed.ts`. Decide which layout to follow before starting backend work.
