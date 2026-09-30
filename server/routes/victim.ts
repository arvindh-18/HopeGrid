// server/routes/victim.ts — victim routes, no login (architecture §8.2):
// POST /api/reports (F01), /api/track (F04), /api/track/verify-phone (F21).
import { Router } from 'express';
import {
  CODE_ALPHABET, DEMO_OTP, MAX_AUDIO_BASE64, MAX_AUDIO_SECONDS, MAX_PEOPLE, MAX_PHOTO_BASE64, MIN_REPORT_TEXT,
  PHONE_MAX_DIGITS, PHONE_MIN_DIGITS, PIN_LENGTH, REPORT_CODE_LENGTH,
} from '../../shared/constants';
import { victimStep } from '../../shared/trackingStatus';
import {
  ApiError, CHAT_OPEN_ASSIGNMENT, NEEDS,
  type IncidentRecord, type LogRecord, type Need, type ReportRecord, type ReportSubmission, type TrackView,
} from '../../shared/types';
import { fromRow, fromRows, submissionToReportRow } from '../mappers';
import { addLog, assignmentsOf, enqueueReport, getIncident, recomputeIncident } from '../pipeline';
import { openStream } from '../events';
import { uploadBase64 } from '../storage';
import { db } from '../supabase';

export const victimRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${REPORT_CODE_LENGTH}}$`);
const PIN_RE = new RegExp(`^\\d{${PIN_LENGTH}}$`);
const PHONE_RE = new RegExp(`^\\+?\\d{${PHONE_MIN_DIGITS},${PHONE_MAX_DIGITS}}$`);
// Storage paths allow audio.{webm|mp4|ogg} (architecture §6.7); MediaRecorder may add ";codecs=…".
export const AUDIO_EXT_RE = /^audio\/(webm|mp4|ogg)(;.*)?$/;

// Uploads must be real base64 of the file type they claim (not just any string of the allowed length).
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const isBase64 = (s: string) => s.length % 4 === 0 && BASE64_RE.test(s);
const head = (b64: string) => Buffer.from(b64.slice(0, 24), 'base64');
/** Photo: the phone always re-encodes to JPEG (BR-04), which starts with FF D8 FF. */
export const isJpegBase64 = (b64: string) => isBase64(b64) && head(b64).subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
/** Audio: the container's signature must match the claimed mime (WebM/EBML, MP4 "ftyp", Ogg "OggS"). */
export function isAudioBase64(b64: string, mime: string): boolean {
  const ext = AUDIO_EXT_RE.exec(mime)?.[1];
  if (!ext || !isBase64(b64)) return false;
  const h = head(b64);
  if (ext === 'webm') return h.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (ext === 'mp4') return h.subarray(4, 8).toString('latin1') === 'ftyp';
  return h.subarray(0, 4).toString('latin1') === 'OggS';
}

const invalid = (message: string) => new ApiError('VALIDATION', message);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optStr = (v: unknown): v is string | null => v === null || isStr(v);

/** BR-03 server re-check. Returns the submission typed, or throws VALIDATION. */
function validateSubmission(body: unknown): ReportSubmission {
  if (!body || typeof body !== 'object') throw invalid('The report is empty.');
  const b = body as Record<string, unknown>;

  if (!isStr(b.id) || !UUID_RE.test(b.id)) throw invalid('Report id is invalid.');
  if (!isStr(b.code) || !CODE_RE.test(b.code)) throw invalid('Report code is invalid.');
  if (!isStr(b.pin) || !PIN_RE.test(b.pin)) throw invalid('Report PIN is invalid.');
  if (!isStr(b.deviceId) || !b.deviceId.trim()) throw invalid('Device id is missing.');
  if (!isStr(b.text)) throw invalid('Description must be text.');
  if (!isStr(b.createdAt) || Number.isNaN(Date.parse(b.createdAt))) throw invalid('Report time is invalid.');

  const hasLat = b.lat !== null && b.lat !== undefined;
  const hasLng = b.lng !== null && b.lng !== undefined;
  if (hasLat !== hasLng) throw invalid('Location needs both latitude and longitude.');
  if (hasLat && !(isNum(b.lat) && Math.abs(b.lat) <= 90 && isNum(b.lng) && Math.abs(b.lng) <= 180)) {
    throw invalid('Location coordinates are invalid.');
  }
  if (!optStr(b.locationText ?? null)) throw invalid('Location description must be text.');

  if (!(b.people === null || b.people === undefined || (Number.isInteger(b.people) && (b.people as number) >= 0 && (b.people as number) <= MAX_PEOPLE))) {
    throw invalid(`Number of people must be between 0 and ${MAX_PEOPLE}.`);
  }
  if (!Array.isArray(b.needs) || !b.needs.every((n) => (NEEDS as readonly unknown[]).includes(n))) {
    throw invalid('Needs contain an unknown value.');
  }
  if (!(b.phone === null || b.phone === undefined || (isStr(b.phone) && PHONE_RE.test(b.phone)))) {
    throw invalid(`Phone number must be ${PHONE_MIN_DIGITS}–${PHONE_MAX_DIGITS} digits, optionally starting with +.`);
  }

  if (!optStr(b.photoBase64 ?? null)) throw invalid('Photo is invalid.');
  if (isStr(b.photoBase64) && b.photoBase64.length > MAX_PHOTO_BASE64) throw invalid('Photo is too large.');
  if (isStr(b.photoBase64) && b.photoBase64 && !isJpegBase64(b.photoBase64)) throw invalid('Photo is not a valid JPEG image.');

  const hasAudio = isStr(b.audioBase64) && b.audioBase64.length > 0;
  if (!optStr(b.audioBase64 ?? null)) throw invalid('Voice note is invalid.');
  if (hasAudio) {
    if ((b.audioBase64 as string).length > MAX_AUDIO_BASE64) throw invalid('Voice note is too large.');
    if (!isStr(b.audioMime) || !AUDIO_EXT_RE.test(b.audioMime)) throw invalid('Voice note format is not supported.');
    if (!isAudioBase64(b.audioBase64 as string, b.audioMime)) throw invalid('Voice note is not a valid recording.');
    if (!isNum(b.audioSeconds) || b.audioSeconds < 0 || b.audioSeconds > MAX_AUDIO_SECONDS) {
      throw invalid(`Voice note must be at most ${MAX_AUDIO_SECONDS} seconds.`);
    }
  }

  const locationText = isStr(b.locationText) && b.locationText.trim() ? b.locationText.trim() : null;
  const needs = [...new Set(b.needs as Need[])];

  // Content: text ≥ 5 chars OR audio OR ≥ 1 need. Location: coordinates OR location text OR audio.
  if (!(b.text.trim().length >= MIN_REPORT_TEXT || hasAudio || needs.length >= 1)) {
    throw invalid('Describe what happened, record a voice note, or choose the help you need.');
  }
  if (!(hasLat || locationText || hasAudio)) throw invalid('Add where you are.');

  return {
    id: b.id.toLowerCase(),
    code: b.code,
    pin: b.pin,
    deviceId: b.deviceId,
    text: b.text,
    lat: hasLat ? (b.lat as number) : null,
    lng: hasLng ? (b.lng as number) : null,
    locationText,
    people: (b.people as number | null | undefined) ?? null,
    needs,
    phone: (b.phone as string | null | undefined) ?? null,
    photoBase64: isStr(b.photoBase64) && b.photoBase64 ? b.photoBase64 : null,
    audioBase64: hasAudio ? (b.audioBase64 as string) : null,
    audioMime: hasAudio ? (b.audioMime as string) : null,
    audioSeconds: hasAudio ? Math.round(b.audioSeconds as number) : null,
    createdAt: new Date(b.createdAt).toISOString(),
  };
}

async function findReportCode(id: string): Promise<string | null> {
  const { data, error } = await db.from('reports').select('code').eq('id', id).maybeSingle();
  if (error) throw new Error(`Report lookup failed: ${error.message}`);
  return data?.code ?? null;
}

// POST /api/reports — architecture §11.2 (steps up to "insert report (PENDING) → 201").
victimRouter.post('/reports', async (req, res) => {
  const sub = validateSubmission(req.body);

  // Idempotent: the phone-generated id may be sent more than once (outbox retry).
  const existingCode = await findReportCode(sub.id);
  if (existingCode) {
    res.status(200).json({ ok: true, code: existingCode });
    return;
  }

  const { data: codeOwner, error: codeError } = await db.from('reports').select('id').eq('code', sub.code).maybeSingle();
  if (codeError) throw new Error(`Report code lookup failed: ${codeError.message}`);
  if (codeOwner) throw new ApiError('CODE_TAKEN', 'This report code is already in use.');

  const photoPath = sub.photoBase64 ? `reports/${sub.id}/photo.jpg` : null;
  const audioPath = sub.audioBase64 && sub.audioMime ? `reports/${sub.id}/audio.${AUDIO_EXT_RE.exec(sub.audioMime)![1]}` : null;
  if (photoPath) await uploadBase64(photoPath, sub.photoBase64!, 'image/jpeg');
  if (audioPath) await uploadBase64(audioPath, sub.audioBase64!, sub.audioMime!);

  const { error } = await db.from('reports').insert(submissionToReportRow(sub, { photoPath, audioPath }));
  if (error) {
    // Unique violation: a concurrent retry won the race (same id) or another phone took the code.
    if (error.code === '23505') {
      const code = await findReportCode(sub.id);
      if (code) {
        res.status(200).json({ ok: true, code });
        return;
      }
      throw new ApiError('CODE_TAKEN', 'This report code is already in use.');
    }
    throw new Error(`Report insert failed: ${error.message}`);
  }

  res.status(201).json({ ok: true, code: sub.code });
  enqueueReport(sub.id); // processed in the background (architecture D9)
});

// ---------------------------------------------------------------- tracking (F04) and phone verification (F21)

/** Victim routes authenticate with code + PIN. Wrong pair → 401 with the Track page's message (F04). */
export async function victimReport(body: unknown): Promise<ReportRecord> {
  const b = (body ?? {}) as Record<string, unknown>;
  const code = isStr(b.code) ? b.code.trim().toUpperCase() : '';
  const pin = isStr(b.pin) ? b.pin.trim() : '';
  if (!code || !pin) throw invalid('Enter your code and PIN.');
  const { data, error } = await db.from('reports').select('*').eq('code', code).eq('pin', pin).maybeSingle();
  if (error) throw new Error(`Report lookup failed: ${error.message}`);
  if (!data) throw new ApiError('UNAUTHORIZED', 'Code or PIN not found. Check and try again.');
  return fromRow<ReportRecord>(data);
}

/** The report's live incident. Reports move on merge, so incident_id always points at the current one. */
export async function victimIncident(r: ReportRecord): Promise<IncidentRecord | null> {
  return r.incidentId ? getIncident(r.incidentId) : null;
}

// POST /api/track {code, pin} → TrackView
victimRouter.post('/track', async (req, res) => {
  const r = await victimReport(req.body);
  const i = await victimIncident(r);
  const assignments = i ? await assignmentsOf(i.id) : [];
  let messages: TrackView['messages'] = [];
  if (i) {
    const { data, error } = await db.from('incident_logs').select('*').eq('incident_id', i.id).eq('public', true).order('created_at', { ascending: false });
    if (error) throw new Error(`Log lookup failed: ${error.message}`);
    messages = fromRows<LogRecord>(data).map((l) => ({ at: l.createdAt, text: l.text }));
  }
  const view: TrackView = {
    code: r.code,
    step: victimStep({
      processingStatus: r.processingStatus,
      incident: i ? { status: i.status, verifiedAt: i.verifiedAt } : null,
      assignments,
    }),
    updatedAt: i?.updatedAt ?? r.receivedAt,
    messages,
    phoneVerified: r.phoneVerified,
    chatOpen: assignments.some((a) => CHAT_OPEN_ASSIGNMENT.includes(a.status)),
  };
  res.json(view);
});

// POST /api/track/events {code, pin} — Server-Sent Events for this report only. The payload is empty: a victim's
// screen learns only that something changed, then refetches /api/track (architecture D12).
victimRouter.post('/track/events', async (req, res) => {
  const r = await victimReport(req.body);
  let incidentId = r.incidentId;
  openStream(res, async (c) => {
    if (c.reportId === r.id) incidentId = c.incidentId; // linked, finished processing, or a chat message
    else if (!incidentId || c.incidentId !== incidentId) return null;
    // Follow a merge: the report may now belong to another incident.
    const { data } = await db.from('reports').select('incident_id').eq('id', r.id).maybeSingle();
    if (data?.incident_id) incidentId = data.incident_id;
    return {};
  });
});

// POST /api/track/verify-phone {code, pin, phone, otp} — BR-140 (no SMS is sent).
victimRouter.post('/track/verify-phone', async (req, res) => {
  const r = await victimReport(req.body);
  const phone = isStr(req.body.phone) ? req.body.phone.replace(/\s+/g, '') : '';
  if (!PHONE_RE.test(phone)) throw invalid(`Phone number must be ${PHONE_MIN_DIGITS}–${PHONE_MAX_DIGITS} digits, optionally starting with +.`);
  if (!isStr(req.body.otp) || req.body.otp.trim() !== DEMO_OTP) throw invalid('That code is not correct. Check it and try again.');
  const { error } = await db.from('reports').update({ phone, phone_verified: true }).eq('id', r.id);
  if (error) throw new Error(`Report update failed: ${error.message}`);
  if (r.incidentId) {
    await addLog(r.incidentId, 'Reporter phone verified', false);
    await recomputeIncident(r.incidentId);
  }
  res.json({ ok: true });
});
