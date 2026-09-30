// server/smsGateway.ts — sends an SMS through the gateway phone's Local Server API (F27 replies, F28 SOS to
// volunteers). Best effort: a failed SMS is logged, never thrown — the report or assignment is already saved.
import { SMS_REPLY_TIMEOUT_MS } from '../shared/constants';

export async function sendSms(to: string, text: string): Promise<boolean> {
  let base = process.env.SMS_GATEWAY_URL?.trim().replace(/\/+$/, '');
  if (!base) return false;
  if (!/^https?:\/\//.test(base)) base = `http://${base}`; // the app shows the address without http://
  const auth = Buffer.from(`${process.env.SMS_GATEWAY_USER ?? ''}:${process.env.SMS_GATEWAY_PASSWORD ?? ''}`).toString('base64');
  try {
    const res = await fetch(`${base}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ textMessage: { text }, phoneNumbers: [to] }),
      signal: AbortSignal.timeout(SMS_REPLY_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`SMS to …${to.slice(-4)} failed: the gateway answered ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn(`SMS to …${to.slice(-4)} failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}
