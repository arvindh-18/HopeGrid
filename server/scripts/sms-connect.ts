// server/scripts/sms-connect.ts — `npm run sms:connect`: tells the SMS gateway phone ("SMS Gateway for Android" in
// Local Server mode) to forward every SMS it receives to this server's POST /api/sms/incoming (features.md F27).
//   npm run sms:connect            the phone reaches the server at PUBLIC_SERVER_URL (the phone needs mobile data)
//   npm run sms:connect -- --usb   the phone is plugged into this laptop by USB (adb): no internet needed anywhere
// Reads SMS_GATEWAY_URL, SMS_GATEWAY_USER and SMS_GATEWAY_PASSWORD (shown in the gateway app) from .env. Safe to run
// again: an older HopeGrid address on the phone is replaced.
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK_PATH = '/api/sms/incoming';
const usb = process.argv.includes('--usb');
const port = Number(process.env.PORT) || 3000;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!process.env.SMS_WEBHOOK_SECRET?.trim()) fail('Set SMS_WEBHOOK_SECRET in .env first (any long random text), then restart `npm start`.');

function adbPath(): string {
  const sdk = process.env.ANDROID_HOME || join(homedir(), process.platform === 'win32' ? 'AppData/Local/Android/Sdk' : 'Library/Android/sdk');
  const inSdk = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  return existsSync(inSdk) ? inSdk : 'adb';
}

let gateway = process.env.SMS_GATEWAY_URL?.trim().replace(/\/+$/, '') ?? '';
let target: string;
if (usb) {
  const adb = adbPath();
  try {
    // On the phone, 127.0.0.1:PORT now reaches this laptop's server; on the laptop, 127.0.0.1:8080 reaches the phone.
    execFileSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'pipe' });
    execFileSync(adb, ['forward', 'tcp:8080', 'tcp:8080'], { stdio: 'pipe' });
  } catch (e) {
    fail(`adb could not reach the phone (${e instanceof Error ? e.message.split('\n')[0] : e}). Plug it in by USB, allow USB debugging on it, and try again.`);
  }
  if (gateway && gateway !== 'http://127.0.0.1:8080') {
    console.warn('Note: set SMS_GATEWAY_URL=http://127.0.0.1:8080 in .env (and restart `npm start`) so replies also go over USB.');
  }
  gateway = 'http://127.0.0.1:8080';
  target = `http://127.0.0.1:${port}${HOOK_PATH}`; // plain http is allowed by the gateway app only for 127.0.0.1
} else {
  if (!gateway) fail('Set SMS_GATEWAY_URL in .env to the address the gateway app shows (e.g. http://192.168.1.20:8080), or use --usb.');
  let origin = '';
  try {
    origin = new URL(process.env.PUBLIC_SERVER_URL ?? '').origin;
  } catch { /* checked below */ }
  if (!origin.startsWith('https://') || origin.includes('your-domain')) {
    fail('Set PUBLIC_SERVER_URL in .env to the https address of this server (the ngrok domain), or use --usb.');
  }
  target = `${origin}${HOOK_PATH}`;
}

const auth = `Basic ${Buffer.from(`${process.env.SMS_GATEWAY_USER ?? ''}:${process.env.SMS_GATEWAY_PASSWORD ?? ''}`).toString('base64')}`;
async function gatewayApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${gateway}${path}`, {
      method,
      headers: { Authorization: auth, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return fail(`Could not reach the gateway app at ${gateway}. Is its Local Server switched on and "Online", on the same Wi-Fi (or USB)?`);
  }
  if (res.status === 401) fail('The gateway app refused the login: check SMS_GATEWAY_USER and SMS_GATEWAY_PASSWORD in .env.');
  if (!res.ok) fail(`The gateway app answered ${res.status} to ${method} ${path}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

type Webhook = { id: string; url: string; event: string };
const hooks = (await gatewayApi<Webhook[] | null>('GET', '/webhooks')) ?? [];
for (const h of hooks) {
  if (h.event === 'sms:received' && h.url.endsWith(HOOK_PATH) && h.url !== target) {
    await gatewayApi('DELETE', `/webhooks/${encodeURIComponent(h.id)}`);
    console.log(`Removed the old address ${h.url}`);
  }
}
if (!hooks.some((h) => h.event === 'sms:received' && h.url === target)) await gatewayApi('POST', '/webhooks', { url: target, event: 'sms:received' });
console.log(`\nThe gateway phone now forwards every SMS it receives to ${target}`);

console.log(`
Two settings in the gateway app, once:
  1. Settings → Webhooks → Signing Key: paste the SMS_WEBHOOK_SECRET value from .env.${usb ? `
  2. Settings → Webhooks → turn OFF "Require Internet connection".` : ''}
Then send any SMS to the gateway phone's number: it should appear on the coordinator dashboard with an "SMS" tag.
The HopeGrid app shows "Send by SMS" only when it was built with VITE_SMS_NUMBER (that phone's number) in .env.`);
