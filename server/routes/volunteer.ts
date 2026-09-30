// server/routes/volunteer.ts — /api/volunteer/* except chat (F15, F16). Transitions per BR-101…BR-104, applied by
// server/dispatch.ts (shared with SMS answers, F28).
import { Router } from 'express';
import { effectivePriority } from '../../shared/scoring';
import {
  ACTIVE_ASSIGNMENT, ApiError, CHAT_OPEN_ASSIGNMENT, EQUIPMENT, SKILLS, VEHICLES,
  type AssignmentRecord, type AssignmentStatus, type IncidentRecord, type ProfileRecord, type VolunteerAssignment,
  type VolunteerProfile, type VolunteerProfilePatch,
} from '../../shared/types';
import { currentUser, loadProfile, requireRole } from '../auth';
import { applyVolunteerStatus } from '../dispatch';
import { fromRows, toRow } from '../mappers';
import { getIncident, reportsOf } from '../pipeline';
import { openStream } from '../events';
import { db } from '../supabase';
import { ownAssignment } from './messages';

export const volunteerRouter = Router();
volunteerRouter.use(requireRole('VOLUNTEER'));

const RECENT_FINISHED = 5;

const toProfile = (p: ProfileRecord): VolunteerProfile => ({
  id: p.id, name: p.name, skills: p.skills, equipment: p.equipment, vehicle: p.vehicle, availability: p.availability, lat: p.lat, lng: p.lng,
});

async function me(id: string): Promise<ProfileRecord> {
  const p = await loadProfile(id);
  if (!p) throw new ApiError('UNAUTHORIZED', 'This account has no staff profile.');
  return p;
}

/** Assignment → volunteer view. No names or phone numbers of reporters (AR-23). */
async function toVolunteerAssignment(a: AssignmentRecord, i?: IncidentRecord): Promise<VolunteerAssignment> {
  const incident = i ?? (await getIncident(a.incidentId));
  const reports = await reportsOf(incident.id);
  return {
    id: a.id, status: a.status, reason: a.reason, auto: !!a.auto, respondBy: a.respondBy ?? null, updatedAt: a.updatedAt,
    incident: {
      id: incident.id, code: incident.code, type: incident.type, summary: incident.summary, people: incident.people,
      vulnerable: incident.vulnerable, trapped: incident.trapped, medical: incident.medical, danger: incident.danger,
      needs: incident.needs, lat: incident.lat, lng: incident.lng, locationText: incident.locationText,
      priority: effectivePriority(incident.priority, incident.priorityOverride),
    },
    reporters: reports.map((r, n) => ({ reportId: r.id, label: `Reporter ${n + 1}` })),
  };
}

// GET /api/volunteer/events — Server-Sent Events for the incidents this volunteer is assigned to, and no others.
volunteerRouter.get('/events', async (req, res) => {
  const user = currentUser(req);
  const mine = new Set<string>();
  const reload = async () => {
    const { data, error } = await db.from('assignments').select('incident_id').eq('volunteer_id', user.id);
    if (error) return; // keep the last known set
    mine.clear();
    for (const a of data) mine.add(a.incident_id);
  };
  await reload();
  openStream(res, (c) => {
    if (c.volunteerId === user.id) mine.add(c.incidentId);
    if (!mine.has(c.incidentId)) return null;
    void reload(); // a merge may have moved the assignment to another incident
    return { incidentId: c.incidentId };
  });
});

// GET /api/volunteer/me
volunteerRouter.get('/me', async (req, res) => {
  res.json(toProfile(await me(currentUser(req).id)));
});

// PATCH /api/volunteer/me {availability?, skills?, equipment?, vehicle?, lat?, lng?} — F16
volunteerRouter.patch('/me', async (req, res) => {
  const user = currentUser(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: VolunteerProfilePatch = {};
  const invalid = (m: string) => new ApiError('VALIDATION', m);
  if ('availability' in b) {
    if (b.availability !== 'AVAILABLE' && b.availability !== 'OFFLINE') throw invalid('Busy is set automatically when you accept an assignment.');
    const { data, error } = await db.from('assignments').select('id').eq('volunteer_id', user.id).in('status', CHAT_OPEN_ASSIGNMENT);
    if (error) throw new Error(`Assignment lookup failed: ${error.message}`);
    if (data.length) throw new ApiError('INVALID_STATE', 'Finish your current assignment before changing availability.');
    patch.availability = b.availability;
  }
  if ('skills' in b) {
    if (!Array.isArray(b.skills) || !b.skills.every((s) => (SKILLS as readonly unknown[]).includes(s))) throw invalid('Unknown skill.');
    patch.skills = [...new Set(b.skills)] as VolunteerProfile['skills'];
  }
  if ('equipment' in b) {
    if (!Array.isArray(b.equipment) || !b.equipment.every((s) => (EQUIPMENT as readonly unknown[]).includes(s))) throw invalid('Unknown equipment.');
    patch.equipment = [...new Set(b.equipment)] as VolunteerProfile['equipment'];
  }
  if ('vehicle' in b) {
    if (!(VEHICLES as readonly unknown[]).includes(b.vehicle)) throw invalid('Unknown vehicle.');
    patch.vehicle = b.vehicle as VolunteerProfile['vehicle'];
  }
  if ('lat' in b || 'lng' in b) {
    if (!(typeof b.lat === 'number' && typeof b.lng === 'number' && Math.abs(b.lat) <= 90 && Math.abs(b.lng) <= 180)) throw invalid('Location is invalid.');
    patch.lat = b.lat;
    patch.lng = b.lng;
  }
  const { error } = await db.from('profiles').update(toRow(patch)).eq('id', user.id);
  if (error) throw new Error(`Profile update failed: ${error.message}`);
  res.json(toProfile(await me(user.id)));
});

// GET /api/volunteer/assignments → active first, then the last 5 finished
volunteerRouter.get('/assignments', async (req, res) => {
  const { data, error } = await db.from('assignments').select('*').eq('volunteer_id', currentUser(req).id).order('updated_at', { ascending: false });
  if (error) throw new Error(`Assignment lookup failed: ${error.message}`);
  const mine = fromRows<AssignmentRecord>(data);
  const active = mine.filter((a) => ACTIVE_ASSIGNMENT.includes(a.status));
  const finished = mine.filter((a) => !ACTIVE_ASSIGNMENT.includes(a.status)).slice(0, RECENT_FINISHED);
  res.json(await Promise.all([...active, ...finished].map((a) => toVolunteerAssignment(a))));
});

// POST /api/volunteer/push-token {token: string | null} — the app's Firebase push address, or null to stop (F28)
volunteerRouter.post('/push-token', async (req, res) => {
  const token = req.body?.token;
  if (!(token === null || (typeof token === 'string' && token.length > 0 && token.length <= 4096))) {
    throw new ApiError('VALIDATION', 'Push token is invalid.');
  }
  const { error } = await db.from('profiles').update({ push_token: token }).eq('id', currentUser(req).id);
  if (error) throw new Error(`Profile update failed: ${error.message}`);
  res.json({ ok: true });
});

// POST /api/volunteer/assignments/:id/status {status, reason?}
volunteerRouter.post('/assignments/:id/status', async (req, res) => {
  const user = currentUser(req);
  const a = await ownAssignment(req.params.id, user.id);
  const status = req.body?.status as AssignmentStatus;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
  await applyVolunteerStatus(a, user, status, reason);
  const updated = await ownAssignment(a.id, user.id);
  res.json(await toVolunteerAssignment(updated));
});
