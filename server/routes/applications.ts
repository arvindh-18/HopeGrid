// server/routes/applications.ts — volunteer self-registration (F26, rules.md BR-150). Public: anyone can apply.
// The applicant's Supabase login is created at once (the password is only ever held by Supabase Auth), but it
// can't be used until a coordinator approves the application, because there is no profile row until then.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { MAX_PHOTO_BASE64, MIN_PASSWORD_LENGTH, PHONE_MAX_DIGITS, PHONE_MIN_DIGITS } from '../../shared/constants';
import { ApiError, EQUIPMENT, SKILLS, VEHICLES, type Equipment, type Skill, type Vehicle } from '../../shared/types';
import { toRow } from '../mappers';
import { removeFiles, uploadBase64 } from '../storage';
import { db } from '../supabase';
import { isJpegBase64 } from './victim';

export const applicationsRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = new RegExp(`^\\+?\\d{${PHONE_MIN_DIGITS},${PHONE_MAX_DIGITS}}$`);
const NAME_MAX = 80;
const LOCATION_MAX = 200;
const invalid = (m: string) => new ApiError('VALIDATION', m);
const isStr = (v: unknown): v is string => typeof v === 'string';
const listOf = <T extends string>(v: unknown, allowed: readonly T[]): T[] | null =>
  Array.isArray(v) && v.every((x) => (allowed as readonly unknown[]).includes(x)) ? [...new Set(v as T[])] : null;

// POST /api/volunteer-applications → 201 {ok:true}
applicationsRouter.post('/volunteer-applications', async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const name = isStr(b.name) ? b.name.trim() : '';
  if (name.length < 2 || name.length > NAME_MAX) throw invalid('Enter your full name.');
  const email = isStr(b.email) ? b.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw invalid('Enter a valid email address.');
  const phone = isStr(b.phone) ? b.phone.replace(/\s+/g, '') : '';
  if (!PHONE_RE.test(phone)) throw invalid(`Phone number must be ${PHONE_MIN_DIGITS}–${PHONE_MAX_DIGITS} digits, optionally starting with +.`);
  const password = isStr(b.password) ? b.password : '';
  if (password.length < MIN_PASSWORD_LENGTH) throw invalid(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  const skills = listOf<Skill>(b.skills, SKILLS);
  if (!skills || skills.length === 0) throw invalid('Choose at least one skill (General help is fine).');
  const equipment = listOf<Equipment>(b.equipment ?? [], EQUIPMENT);
  if (!equipment) throw invalid('Equipment contains an unknown item.');
  const vehicle = (VEHICLES as readonly unknown[]).includes(b.vehicle ?? 'NONE') ? ((b.vehicle ?? 'NONE') as Vehicle) : null;
  if (!vehicle) throw invalid('Unknown vehicle.');
  const hasLat = b.lat !== null && b.lat !== undefined;
  const hasLng = b.lng !== null && b.lng !== undefined;
  if (hasLat !== hasLng || (hasLat && !(typeof b.lat === 'number' && Math.abs(b.lat) <= 90 && typeof b.lng === 'number' && Math.abs(b.lng) <= 180))) {
    throw invalid('Location is invalid.');
  }
  const locationText = isStr(b.locationText) && b.locationText.trim() ? b.locationText.trim().slice(0, LOCATION_MAX) : null;
  const proof = isStr(b.proofBase64) ? b.proofBase64 : '';
  if (!proof) throw invalid('Add a photo of an ID proof.');
  if (proof.length > MAX_PHOTO_BASE64) throw invalid('The ID proof photo is too large.');
  if (!isJpegBase64(proof)) throw invalid('The ID proof must be a photo (JPEG).');

  // 1. The login (Supabase Auth hashes the password). An existing email means an account or application exists.
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    if (/already|registered|exists/i.test(created.error?.message ?? '')) throw invalid('An account with this email already exists.');
    throw new Error(`Creating the login failed: ${created.error?.message}`);
  }
  const userId = created.data.user.id;

  // 2. Proof photo + application row. If either fails, undo the login so the person can simply try again.
  const id = randomUUID();
  const proofPath = `applications/${id}/proof.jpg`;
  try {
    await uploadBase64(proofPath, proof, 'image/jpeg');
    const { error } = await db.from('volunteer_applications').insert(toRow({
      id, userId, name, email, phone, skills, equipment, vehicle,
      lat: hasLat ? (b.lat as number) : null, lng: hasLng ? (b.lng as number) : null, locationText, proofPath,
    }));
    if (error) throw new Error(`Saving the application failed: ${error.message}`);
  } catch (e) {
    await db.auth.admin.deleteUser(userId).catch(() => undefined);
    await removeFiles([proofPath]).catch(() => undefined);
    throw e;
  }
  res.status(201).json({ ok: true });
});
