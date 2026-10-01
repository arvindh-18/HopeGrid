// server/push.ts — push notifications to the volunteer app through Firebase Cloud Messaging (F28), so an SOS reaches a
// volunteer whose app is closed. Off unless FIREBASE_SERVICE_ACCOUNT names the service-account key file from the
// Firebase console (keep that file out of git). Calls the FCM HTTP v1 API directly: the Google access token is signed
// from the service account with node:crypto, so the server needs no Firebase package.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PUSH_CHANNEL, PUSH_TIMEOUT_MS } from '../shared/constants';

interface ServiceAccount { project_id: string; client_email: string; private_key: string; token_uri?: string }
export type PushResult = 'SENT' | 'NOT_CONFIGURED' | 'INVALID_TOKEN' | 'FAILED';

let account: ServiceAccount | null | undefined;
let cached: { token: string; expires: number } | null = null;

function loadAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  account = null;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!path) return null;
  try {
    const a = JSON.parse(readFileSync(path, 'utf8'));
    if (a.project_id && a.client_email && a.private_key) account = a;
    else console.warn('FIREBASE_SERVICE_ACCOUNT is not a Firebase service-account key file.');
  } catch (e) {
    console.warn(`FIREBASE_SERVICE_ACCOUNT could not be read: ${e instanceof Error ? e.message : e}`);
  }
  return account ?? null;
}

export const pushConfigured = (): boolean => loadAccount() !== null;

/** For tests: forget the loaded key and access token. */
export function resetPush(): void {
  account = undefined;
  cached = null;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

async function accessToken(a: ServiceAccount): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = a.token_uri ?? 'https://oauth2.googleapis.com/token';
  const claims = { iss: a.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat: now, exp: now + 3600 };
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(a.private_key);
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(signature)}` }),
    signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) throw new Error(`Google sign-in for push failed (${res.status})`);
  cached = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** Sends one notification. Never throws. INVALID_TOKEN: the app was removed or reinstalled — forget that token. */
export async function sendPush(token: string, n: { title: string; body: string; data?: Record<string, string> }): Promise<PushResult> {
  const a = loadAccount();
  if (!a) return 'NOT_CONFIGURED';
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken(a)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: n.title, body: n.body },
          data: n.data ?? {},
          // High priority, on the app's "Help requests" channel, so it pops up with sound even when the app is closed.
          android: {
            priority: 'HIGH',
            notification: { sound: 'default', channel_id: PUSH_CHANNEL, notification_priority: 'PRIORITY_MAX', default_vibrate_timings: true, visibility: 'PUBLIC' },
          },
        },
      }),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    if (res.ok) return 'SENT';
    const err = await res.json().catch(() => null);
    const code = err?.error?.details?.find((d: { errorCode?: string }) => d.errorCode)?.errorCode ?? err?.error?.status;
    if (res.status === 404 || code === 'UNREGISTERED') return 'INVALID_TOKEN';
    console.warn(`Push failed: ${res.status} ${code ?? ''}`);
    return 'FAILED';
  } catch (e) {
    console.warn(`Push failed: ${e instanceof Error ? e.message : e}`);
    return 'FAILED';
  }
}
