// server/scripts/tunnel-vercel.ts — `npm run tunnel:vercel`: starts a Cloudflare quick tunnel to this laptop's server
// (port 3000) and writes the tunnel's address into vercel.json, so the site on Vercel forwards /api to this laptop.
// The quick-tunnel address changes on every start: commit and push vercel.json afterwards so Vercel redeploys.
// Keep this running; closing it closes the tunnel.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VERCEL_JSON = resolve('vercel.json');
const TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:3000'], { stdio: ['ignore', 'pipe', 'pipe'] });
tunnel.on('error', () => {
  console.error('Could not start cloudflared. Install it (macOS: brew install cloudflared) and try again.');
  process.exit(1);
});

let done = false;
const watch = (chunk: Buffer) => {
  if (done) return;
  const url = TUNNEL_URL.exec(chunk.toString())?.[0];
  if (!url) return;
  done = true;
  const config = JSON.parse(readFileSync(VERCEL_JSON, 'utf8'));
  const api = config.rewrites.find((r: { source: string }) => r.source === '/api/:path*');
  const before = api.destination as string;
  api.destination = `${url}/api/:path*`;
  writeFileSync(VERCEL_JSON, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`\nTunnel ready: ${url}  →  http://localhost:3000`);
  if (before === api.destination) {
    console.log('vercel.json already has this address; nothing to redeploy.');
  } else {
    console.log('vercel.json updated. Now redeploy Vercel:');
    console.log('  git add vercel.json && git commit -m "Tunnel address" && git push');
  }
  console.log('Keep this window open; closing it closes the tunnel. Make sure `npm start` is running too.\n');
};
tunnel.stdout.on('data', watch);
tunnel.stderr.on('data', watch);
tunnel.on('exit', (code) => {
  console.log(done ? 'Tunnel closed.' : `cloudflared stopped before giving an address (exit ${code}).`);
  process.exit(code ?? 0);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => tunnel.kill(sig));
