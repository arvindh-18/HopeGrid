// server/routes/dev.ts — demo tools (F23). Mounted only when DEV_MODE=true, and answers only requests made on
// the server laptop itself: the reset deletes every row, so it must never be reachable through the tunnel.
import { Router, type Request } from 'express';
import { ApiError } from '../../shared/types';
import { runSeed } from '../scripts/seed';

export const devRouter = Router();

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * True only for a request from this machine that no proxy forwarded. The Cloudflare tunnel also connects from
 * 127.0.0.1, so two independent checks refuse it: it adds CF-Connecting-IP / X-Forwarded-For, and its Host header
 * is the public *.trycloudflare.com name. (The Vite dev proxy on the same laptop adds no forwarding headers and
 * keeps Host = localhost, so the DEV "Reset demo data" button still works.)
 */
export function isDirectLocalRequest(req: Request): boolean {
  const forwarded = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['forwarded'];
  return LOOPBACK.has(req.socket.remoteAddress ?? '') && !forwarded && LOCAL_HOST_RE.test(req.headers.host ?? '');
}

// POST /api/dev/reset → {ok:true}: deletes everything and re-inserts the §12 demo data.
devRouter.post('/dev/reset', async (req, res) => {
  if (!isDirectLocalRequest(req)) {
    console.warn(`Refused /api/dev/reset from ${req.socket.remoteAddress} (not a direct request on the server laptop)`);
    throw new ApiError('FORBIDDEN', 'Demo reset only works on the server laptop itself.');
  }
  await runSeed();
  res.json({ ok: true });
});
