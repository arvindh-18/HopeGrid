// server/routes/dev.ts — demo tools (F23). Mounted only when DEV_MODE=true.
import { Router } from 'express';
import { runSeed } from '../scripts/seed';

export const devRouter = Router();

// POST /api/dev/reset → {ok:true}: deletes everything and re-inserts the §12 demo data.
devRouter.post('/dev/reset', async (_req, res) => {
  await runSeed();
  res.json({ ok: true });
});
