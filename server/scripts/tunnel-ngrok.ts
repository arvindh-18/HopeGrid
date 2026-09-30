// server/scripts/tunnel-ngrok.ts — `npm run tunnel:ngrok`: puts this laptop's server (PORT, default 3000) on the fixed
// ngrok address in .env (PUBLIC_SERVER_URL), so phones, the Android app and Vercel always use the same address.
// Uses NGROK_AUTHTOKEN from .env when set (otherwise the token saved by `ngrok config add-authtoken`).
// Also keeps vercel.json pointing at that address, and checks the server answers through the tunnel.
// Keep this running; closing it closes the tunnel. Start `npm start` too.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const port = Number(process.env.PORT) || 3000;
const raw = (process.env.PUBLIC_SERVER_URL ?? '').trim();

let origin: string;
try {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || raw.includes('your-domain')) throw new Error();
  origin = url.origin;
} catch {
  console.error('Set PUBLIC_SERVER_URL in .env to your ngrok static domain, e.g. https://your-name.ngrok-free.dev');
  console.error('(ngrok dashboard → Domains). See .env.example.');
  process.exit(1);
}

// vercel.json forwards the website's /api calls to this laptop: keep it on the same address.
const VERCEL_JSON = resolve('vercel.json');
try {
  const config = JSON.parse(readFileSync(VERCEL_JSON, 'utf8'));
  const api = config.rewrites?.find((r: { source: string }) => r.source === '/api/:path*');
  const want = `${origin}/api/:path*`;
  if (api && api.destination !== want) {
    api.destination = want;
    writeFileSync(VERCEL_JSON, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`vercel.json now forwards /api to ${origin}. Commit and push it once so Vercel redeploys.`);
  }
} catch {
  /* no vercel.json: nothing to keep in step */
}

const env = { ...process.env };
if (!env.NGROK_AUTHTOKEN) delete env.NGROK_AUTHTOKEN; // an empty value would override the saved token
const ngrok = spawn('ngrok', ['http', `--url=${origin}`, String(port), '--log=stdout', '--log-format=logfmt'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
ngrok.on('error', () => {
  console.error('Could not start ngrok. Install it (macOS: brew install ngrok · Windows: winget install ngrok.ngrok) and try again.');
  process.exit(1);
});

let announced = false;
const onOutput = async (chunk: Buffer) => {
  const text = chunk.toString();
  const failure = /lvl=(eror|crit).*?(err|msg)="([^"]+)"/.exec(text);
  if (failure) console.error(`ngrok: ${failure[3]}`);
  if (/authtoken|authentication failed|ERR_NGROK_4018/i.test(text) && !announced) {
    console.error('ngrok needs your authtoken: set NGROK_AUTHTOKEN in .env, or run `ngrok config add-authtoken <token>` once.');
  }
  if (announced || !/started tunnel|url=https:\/\//.test(text)) return;
  announced = true;
  console.log(`\nTunnel ready: ${origin}  →  http://localhost:${port}`);
  try {
    const res = await fetch(`${origin}/api/public/incidents`, { headers: { 'ngrok-skip-browser-warning': '1' }, signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => null);
    console.log(Array.isArray(body?.incidents)
      ? `Check: the HopeGrid server answers through the tunnel (${body.incidents.length} public hazard(s)).`
      : res.status >= 500 && body?.error
        ? `Check: the tunnel works, but the server failed (${res.status}). See the \`npm start\` window; usually the database: the Supabase values in .env, or schema.sql not run in that project.`
        : `Check: the tunnel works but the server answered ${res.status}. Is \`npm start\` running?`);
  } catch {
    console.log('Check: no answer through the tunnel yet. Is `npm start` running on this laptop?');
  }
  console.log('Keep this window open; closing it closes the tunnel.\n');
};
ngrok.stdout.on('data', onOutput);
ngrok.stderr.on('data', onOutput);
ngrok.on('exit', (code) => {
  console.log(announced ? 'Tunnel closed.' : `ngrok stopped before the tunnel started (exit ${code}).`);
  process.exit(code ?? 0);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => ngrok.kill(sig));
