// server/routes/sms.ts — POST /api/sms/incoming (features.md F27, rules.md BR-06, BR-07): reports that arrive by SMS
// through a gateway phone (an Android phone with a SIM running "SMS Gateway for Android"), so a victim needs only
// mobile signal, not mobile data. Accepts that app's webhook (event "sms:received", signed with X-Signature) or, from
// any other gateway, {from, text} with "Authorization: Bearer <SMS_WEBHOOK_SECRET>". Replies go back through the same
// phone when SMS_GATEWAY_URL is set. Mounted before the JSON parser: the signature is computed over the raw body.
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import express, { Router, type Request } from 'express';
import {
  CODE_ALPHABET, EMERGENCY_NUMBER, MAX_REPORT_TEXT, PHONE_MAX_DIGITS, PHONE_MIN_DIGITS, PIN_LENGTH, REPORT_CODE_LENGTH,
  SMS_FOLLOWUP_MINUTES, SMS_REPLY_TIMEOUT_MS,
} from '../../shared/constants';
import { clip, parseSmsReport } from '../../shared/sms';
import { ACTIVE_STATUSES, ApiError, type ReportRecord, type SmsOutcome, type SmsReport } from '../../shared/types';
import { fromRow, toRow } from '../mappers';
import { addLog, changeReport, enqueueReport, getIncident } from '../pipeline';
import { db } from '../supabase';

export const smsRouter = Router();
smsRouter.use(express.raw({ type: () => true, limit: '64kb' }));

const UNIQUE_VIOLATION = '23505';
const PHONE_RE = new RegExp(`^\\+?\\d{${PHONE_MIN_DIGITS},${PHONE_MAX_DIGITS}}$`);
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- the gateway

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** SMS Gateway for Android signs with HMAC-SHA256(secret, raw body + X-Timestamp), hex. Other gateways send a bearer. */
function authorized(req: Request, raw: Buffer, secret: string): boolean {
  const signature = req.get('x-signature');
  const timestamp = req.get('x-timestamp');
  if (signature && timestamp) {
    const expected = createHmac('sha256', secret).update(Buffer.concat([raw, Buffer.from(timestamp)])).digest('hex');
    return sameText(signature.toLowerCase(), expected);
  }
  const auth = req.get('authorization') ?? '';
  return auth.startsWith('Bearer ') && sameText(auth.slice(7).trim(), secret);
}

interface IncomingSms { from: string; text: string; messageId: string | null; receivedAt: string | null }

/** The SMS in a gateway request, or null for other events (sent/delivered receipts, pings…). */
function readIncoming(body: unknown): IncomingSms | null {
  if (!body || typeof body !== 'object') throw new ApiError('VALIDATION', 'Expected a JSON object.');
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  if ('event' in b) {
    if (b.event !== 'sms:received') return null;
    const p = (b.payload ?? {}) as Record<string, unknown>;
    const from = str(p.sender) ?? str(p.phoneNumber);
    const text = str(p.message);
    if (from === null || text === null) throw new ApiError('VALIDATION', 'The SMS has no sender or message.');
    const at = str(p.receivedAt);
    return { from, text, messageId: str(p.messageId), receivedAt: at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : null };
  }
  const from = str(b.from);
  const text = str(b.text);
  if (from === null || text === null) throw new ApiError('VALIDATION', 'Send {from, text}.');
  return { from, text, messageId: null, receivedAt: null };
}

/** Replies through the gateway phone (Local Server API). Best effort: a failed reply is logged, the report is saved. */
async function sendSms(to: string, text: string): Promise<void> {
  const base = process.env.SMS_GATEWAY_URL?.trim().replace(/\/+$/, '');
  if (!base) return;
  const auth = Buffer.from(`${process.env.SMS_GATEWAY_USER ?? ''}:${process.env.SMS_GATEWAY_PASSWORD ?? ''}`).toString('base64');
  try {
    const res = await fetch(`${base}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ textMessage: { text }, phoneNumbers: [to] }),
      signal: AbortSignal.timeout(SMS_REPLY_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`SMS reply to …${to.slice(-4)} failed: the gateway answered ${res.status}`);
  } catch (e) {
    console.warn(`SMS reply to …${to.slice(-4)} failed: ${e instanceof Error ? e.message : e}`);
  }
}

// ---------------------------------------------------------------- reports from SMS (BR-06)

const emergency = () => process.env.EMERGENCY_NUMBER || EMERGENCY_NUMBER;
const newCode = () => Array.from({ length: REPORT_CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const newPin = () => String(randomInt(10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');

/** A stable report id per SMS, so a gateway that delivers the same SMS twice creates one report. */
function idFor(key: string): string {
  const h = createHash('sha256').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function reportWhere(column: 'id' | 'code', value: string): Promise<ReportRecord | null> {
  const { data, error } = await db.from('reports').select('*').eq(column, value).maybeSingle();
  if (error) throw new Error(`Report lookup failed: ${error.message}`);
  return data ? fromRow<ReportRecord>(data) : null;
}

type Result = { outcome: SmsOutcome; code?: string; reply?: string };

/**
 * Inserts an SMS report. A taken code (another phone chose it) gets a new one; the same id means this SMS was already
 * saved (the gateway sent it twice). Returns the code used, or null when it already existed.
 */
async function insertSmsReport(row: Record<string, unknown>): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    const { error } = await db.from('reports').insert(row);
    if (!error) return row.code as string;
    if (error.code !== UNIQUE_VIOLATION || attempt >= 5) throw new Error(`Report insert failed: ${error.message}`);
    if (await reportWhere('id', row.id as string)) return null;
    row.code = newCode();
  }
}

function smsRow(id: string, from: string, receivedAt: string, r: SmsReport) {
  return toRow({
    id, code: r.code, pin: r.pin, deviceId: `sms:${from}`, text: r.text, transcriptStatus: 'NONE',
    lat: r.lat, lng: r.lng, locationText: r.locationText, people: r.people, needs: r.needs,
    // The network delivered the SMS from this number, so the team can call it back (counts as verified, BR-140).
    phone: from, phoneVerified: true,
    channel: 'SMS', pendingMedia: r.pendingMedia, processingStatus: 'PENDING', createdAt: receivedAt,
  });
}

/** A report the app packed into an SMS: it keeps the code and PIN the phone already shows. */
async function receivePacked(from: string, sms: SmsReport, receivedAt: string): Promise<Result> {
  const id = idFor(`sms:${from}:${sms.code}:${sms.pin}`);
  if (await reportWhere('id', id)) return { outcome: 'ALREADY_RECEIVED', code: sms.code };
  const owner = await reportWhere('code', sms.code);
  // Same code and PIN: the phone got online first and sent it by internet, or it was sent from another phone too.
  if (owner && owner.pin === sms.pin) return { outcome: 'ALREADY_RECEIVED', code: owner.code };

  const code = await insertSmsReport(smsRow(id, from, receivedAt, { ...sms, code: owner ? newCode() : sms.code }));
  if (code === null) return { outcome: 'ALREADY_RECEIVED', code: sms.code };
  enqueueReport(id);
  return {
    outcome: 'CREATED', code,
    reply: code === sms.code
      ? `HopeGrid: report ${code} received. Keep your code and PIN to track it. In danger now? Call ${emergency()}.`
      : `HopeGrid: report received. Your code is now ${code}, PIN ${sms.pin}. In danger now? Call ${emergency()}.`,
  };
}

/** BR-06: plain words from a number whose SMS report arrived in the last SMS_FOLLOWUP_MINUTES add to that report. */
async function addFollowUp(from: string, text: string): Promise<Result | null> {
  const { data, error } = await db.from('reports').select('*').eq('phone', from).eq('channel', 'SMS').order('received_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Report lookup failed: ${error.message}`);
  const last = data?.[0] ? fromRow<ReportRecord>(data[0]) : null;
  if (!last || Date.now() - Date.parse(last.receivedAt) > SMS_FOLLOWUP_MINUTES * 60_000) return null;
  if (last.incidentId && !ACTIVE_STATUSES.includes((await getIncident(last.incidentId)).status)) return null;

  let added = false;
  await changeReport(last.id, async () => {
    const current = await reportWhere('id', last.id); // re-read under the lock: another follow-up may have just landed
    if (!current || current.text.includes(text)) return; // the gateway delivered this SMS twice
    const { error: e } = await db.from('reports').update(toRow({
      text: clip(current.text ? `${current.text}\n${text}` : text, MAX_REPORT_TEXT),
      extraction: null, aiSource: null, processingStatus: 'PENDING', // read again (pipeline: later details)
    })).eq('id', last.id);
    if (e) throw new Error(`Report update failed: ${e.message}`);
    added = true;
  });
  if (!added) return { outcome: 'ALREADY_RECEIVED', code: last.code };
  if (last.incidentId) await addLog(last.incidentId, 'Follow-up SMS added to a report', false);
  return { outcome: 'ADDED', code: last.code }; // no reply: an auto-reply from the other side must not start a loop
}

/** Plain words, e.g. from a basic phone: a new report with a code and PIN made here and sent back. */
async function receivePlain(from: string, text: string, receivedAt: string, messageId: string | null): Promise<Result> {
  const id = messageId ? idFor(`sms:${from}:${messageId}:${receivedAt}`) : idFor(`sms:${from}:${receivedAt}:${text}`);
  if (await reportWhere('id', id)) return { outcome: 'ALREADY_RECEIVED' };
  const followUp = await addFollowUp(from, text);
  if (followUp) return followUp;

  const pin = newPin();
  const code = await insertSmsReport(smsRow(id, from, receivedAt, {
    code: newCode(), pin, text: clip(text, MAX_REPORT_TEXT), lat: null, lng: null, locationText: null, people: null, needs: [], pendingMedia: [],
  }));
  if (code === null) return { outcome: 'ALREADY_RECEIVED' };
  enqueueReport(id);
  return {
    outcome: 'CREATED', code,
    reply: `HopeGrid: report received. Code ${code} PIN ${pin}. Reply with more details or your location. In danger now? Call ${emergency()}.`,
  };
}

// POST /api/sms/incoming — from the gateway phone. → {ok, outcome, code?}
smsRouter.post('/incoming', async (req, res) => {
  const secret = process.env.SMS_WEBHOOK_SECRET?.trim();
  if (!secret) throw new ApiError('NOT_FOUND', 'SMS reports are not set up on this server (SMS_WEBHOOK_SECRET is empty).');
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!authorized(req, raw, secret)) throw new ApiError('UNAUTHORIZED', 'Wrong or missing SMS webhook secret or signature.');
  let body: unknown;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new ApiError('VALIDATION', 'Request body is not valid JSON.');
  }

  const sms = readIncoming(body);
  const from = sms?.from.replace(/[\s()-]/g, '') ?? '';
  const text = sms?.text.trim() ?? '';
  // Operator and promotional messages come from names ("JX-JIOINF"), not numbers: never a report, never a reply.
  if (!sms || !PHONE_RE.test(from) || !text) {
    res.json({ ok: true, outcome: 'IGNORED' satisfies SmsOutcome });
    return;
  }

  const receivedAt = sms.receivedAt ?? nowIso();
  const packed = parseSmsReport(text);
  const result = packed ? await receivePacked(from, packed, receivedAt) : await receivePlain(from, text, receivedAt, sms.messageId);
  res.json({ ok: true, outcome: result.outcome, ...(result.code ? { code: result.code } : {}) });
  if (result.reply) void sendSms(from, result.reply);
});
