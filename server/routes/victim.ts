// server/routes/victim.ts — victim routes, no login (architecture §8.2).
// F01: POST /api/reports. Tracking and phone verification (F04, F21) are added later.
import { Router } from 'express';
import {
  CODE_ALPHABET, MAX_AUDIO_BASE64, MAX_AUDIO_SECONDS, MAX_PEOPLE, MAX_PHOTO_BASE64, MIN_REPORT_TEXT,
  PHONE_MAX_DIGITS, PHONE_MIN_DIGITS, PIN_LENGTH, REPORT_CODE_LENGTH,
} from '../../shared/constants';
import { ApiError, NEEDS, type Need, type ReportSubmission } from '../../shared/types';
import { submissionToReportRow } from '../mappers';
import { uploadBase64 } from '../storage';
import { db } from '../supabase';

export const victimRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${REPORT_CODE_LENGTH}}$`);
const PIN_RE = new RegExp(`^\\d{${PIN_LENGTH}}$`);
const PHONE_RE = new RegExp(`^\\+?\\d{${PHONE_MIN_DIGITS},${PHONE_MAX_DIGITS}}$`);
// Storage paths allow audio.{webm|mp4|ogg} (architecture §6.7); MediaRecorder may add ";codecs=…".
const AUDIO_EXT_RE = /^audio\/(webm|mp4|ogg)(;.*)?$/;

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

  const hasAudio = isStr(b.audioBase64) && b.audioBase64.length > 0;
  if (!optStr(b.audioBase64 ?? null)) throw invalid('Voice note is invalid.');
  if (hasAudio) {
    if ((b.audioBase64 as string).length > MAX_AUDIO_BASE64) throw invalid('Voice note is too large.');
    if (!isStr(b.audioMime) || !AUDIO_EXT_RE.test(b.audioMime)) throw invalid('Voice note format is not supported.');
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
  // Processing (processReport, not awaited) is added with F05 — the report stays PENDING until then (D9).
});
