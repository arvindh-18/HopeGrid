// server/routes/admin.ts — all /api/admin/* routes (role ADMIN). Status changes follow BR-100…BR-104 and are
// validated here before every change (AR-16); every incident change writes a log (AR-17).
import { Router } from 'express';
import { MAX_PEOPLE, PUBLIC_TASK_MAX } from '../../shared/constants';
import { distanceBetween, findRelated, mergeFields } from '../../shared/linking';
import { confidenceBand, effectivePriority, priorityRank } from '../../shared/scoring';
import {
  ACTIVE_ASSIGNMENT, ACTIVE_STATUSES, ApiError, INCIDENT_TYPES, NEEDS, PRIORITY_LEVELS, RESOURCE_CATEGORIES,
  type AllocationRecord, type ApplicationRecord, type ApplicationStatus, type AssignmentRecord, type IncidentDetail, type IncidentListItem, type IncidentRecord,
  type HelpOfferRecord, type IncidentType, type LogRecord, type Need, type PriorityLevel, type ProfileRecord, type ReportRecord,
  type ResourceInput, type ResourceRecord, type VolunteerApplication, type VolunteerListItem,
} from '../../shared/types';
import { humanize, isEligible, rankVolunteers } from '../../shared/volunteerMatch';
import { currentUser, requireRole } from '../auth';
import { fromRow, fromRows, toRow } from '../mappers';
import {
  addLog, allAssignments, endAssignment, getIncident, isUuid, recomputeIncident, reportsOf, toLink, updateIncident,
} from '../pipeline';
import { checkPublicTask } from '../../shared/communityHelp';
import { isPublic } from '../../shared/publicView';
import { createAssignment, dispatchState, runDispatch, saveDispatchSettings } from '../dispatch';
import { sendSms } from '../smsGateway';
import { openStream } from '../events';
import { removeFiles, signedUrls } from '../storage';
import { db } from '../supabase';
import { messagesWhere, toChatMessages } from './messages';

export const adminRouter = Router();
adminRouter.use(requireRole('ADMIN'));

const nowIso = () => new Date().toISOString();
const invalid = (m: string) => new ApiError('VALIDATION', m);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

async function rows<T>(query: PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${error.message}`);
  return fromRows<T>(data);
}

function requireActive(i: IncidentRecord, action: string): void {
  if (!ACTIVE_STATUSES.includes(i.status)) {
    throw new ApiError('INVALID_STATE', `This incident is ${i.status.toLowerCase().replace('_', ' ')}, so it cannot be ${action}.`);
  }
}
const activeOf = (asg: AssignmentRecord[]) => asg.find((a) => ACTIVE_ASSIGNMENT.includes(a.status)) ?? null;

// ---------------------------------------------------------------- read models

function listItem(i: IncidentRecord, reports: Pick<ReportRecord, 'audioPath' | 'channel'>[], asg: AssignmentRecord[], dupCode: string | null, pendingHelpOffers = 0): IncidentListItem {
  const active = activeOf(asg);
  const latest = asg[asg.length - 1];
  return {
    id: i.id, code: i.code, type: i.type, status: i.status,
    priority: effectivePriority(i.priority, i.priorityOverride), overridden: i.priorityOverride !== null,
    confidence: i.confidence, confidenceBand: confidenceBand(i.confidence), people: i.people, locationText: i.locationText,
    reportCount: reports.length, hasVoice: reports.some((r) => !!r.audioPath), viaSms: reports.some((r) => r.channel === 'SMS'),
    pendingHelpOffers, possibleDuplicateCode: dupCode,
    // BR-103 derived flags
    needsReassign: (i.status === 'NEW' || i.status === 'VERIFIED') && !active && asg.some((a) => a.status === 'DECLINED' || a.status === 'UNABLE'),
    readyToResolve: i.status === 'IN_PROGRESS' && latest?.status === 'DONE',
    escalationRecommended: i.escalationRecommended, escalated: i.escalatedAt !== null,
    createdAt: i.createdAt, updatedAt: i.updatedAt,
  };
}

async function detail(id: string): Promise<IncidentDetail> {
  const i = await getIncident(id);
  const [reports, assignments, volunteers, allocations, resources, logs, messages, others, offers] = await Promise.all([
    reportsOf(id),
    allAssignments(),
    rows<ProfileRecord>(db.from('profiles').select('*').eq('role', 'VOLUNTEER'), 'Volunteer lookup failed'),
    rows<AllocationRecord>(db.from('allocations').select('*').eq('incident_id', id).order('created_at'), 'Allocation lookup failed'),
    rows<ResourceRecord>(db.from('resources').select('*'), 'Resource lookup failed'),
    rows<LogRecord>(db.from('incident_logs').select('*').eq('incident_id', id).order('created_at', { ascending: false }), 'Log lookup failed'),
    messagesWhere('incident_id', id),
    rows<IncidentRecord>(db.from('incidents').select('*').neq('status', 'MERGED').neq('id', id), 'Incident lookup failed'),
    rows<HelpOfferRecord>(db.from('help_offers').select('*').eq('incident_id', id).order('created_at', { ascending: false }), 'Help offer lookup failed'),
  ]);
  const asg = assignments.filter((a) => a.incidentId === id);
  const dup = i.possibleDuplicateOf ? others.find((o) => o.id === i.possibleDuplicateOf) ?? null : null;
  const canSuggest = (i.status === 'NEW' || i.status === 'VERIFIED') && !activeOf(asg);
  const urls = await signedUrls(reports.flatMap((r) => [r.photoPath, r.audioPath]));
  const chatMessages = await toChatMessages(messages);
  const nameOf = (vid: string) => volunteers.find((v) => v.id === vid)?.name ?? 'Volunteer';
  const phoneOf = (vid: string) => volunteers.find((v) => v.id === vid)?.phone ?? null; // coordinators only: for the WhatsApp button

  return {
    ...listItem(i, reports, asg, dup?.code ?? null, offers.filter((o) => o.status === 'PENDING').length),
    lat: i.lat, lng: i.lng, publicArea: i.publicArea, vulnerable: i.vulnerable, trapped: i.trapped, medical: i.medical,
    danger: i.danger, needs: i.needs, summary: i.summary, confidenceReasons: i.confidenceReasons, priorityScore: i.priorityScore,
    computedPriority: i.priority, priorityReasons: i.priorityReasons, overrideReason: i.overrideReason,
    escalationReasons: i.escalationReasons, escalatedAt: i.escalatedAt, verifiedAt: i.verifiedAt, resolvedAt: i.resolvedAt,
    rejectReason: i.rejectReason,
    reports: reports.map((r, n) => ({
      id: r.id, label: `Report ${n + 1}`, text: r.text, transcript: r.transcript, transcriptStatus: r.transcriptStatus,
      photoUrl: r.photoPath ? urls.get(r.photoPath) ?? null : null, audioUrl: r.audioPath ? urls.get(r.audioPath) ?? null : null,
      audioSeconds: r.audioSeconds, people: r.people, needs: r.needs, phone: r.phone, phoneVerified: r.phoneVerified,
      extraction: r.extraction, aiSource: r.aiSource, processingStatus: r.processingStatus, lat: r.lat, lng: r.lng,
      locationText: r.locationText, channel: r.channel, pendingMedia: r.pendingMedia, completedAt: r.completedAt,
      createdAt: r.createdAt, receivedAt: r.receivedAt,
    })),
    possibleDuplicate: dup ? { id: dup.id, code: dup.code, type: dup.type, summary: dup.summary, distanceM: distanceBetween(i, dup) } : null,
    // BR-45: computed on read, never stored. Only type, place and time matter here.
    related: findRelated(toLink(i, []), others.map((o) => toLink(o, [])), humanize)
      .map(({ id: rid, code, type, text }) => ({ id: rid, code, type, text })),
    suggestions: canSuggest ? rankVolunteers(i, volunteers, assignments) : [],
    assignments: asg.map((a) => ({
      id: a.id, volunteerId: a.volunteerId, volunteerName: nameOf(a.volunteerId), volunteerPhone: phoneOf(a.volunteerId),
      status: a.status, reason: a.reason, auto: !!a.auto, respondBy: a.respondBy ?? null, updatedAt: a.updatedAt,
    })),
    allocations: allocations.map((a) => {
      const res = resources.find((r) => r.id === a.resourceId);
      return { id: a.id, resourceName: res?.name ?? 'Resource', quantity: a.quantity, unit: res?.unit ?? '', createdAt: a.createdAt };
    }),
    logs: logs.map((l) => ({ at: l.createdAt, text: l.text, public: l.public })),
    chats: reports.map((r, n) => ({
      reportId: r.id, label: `Reporter ${n + 1}`,
      messages: chatMessages.filter((_, k) => messages[k].reportId === r.id),
    })),
    openToAll: !!i.openToAll, publicTask: i.publicTask ?? null,
    helpOffers: offers.map(({ id: oid, name, phone, kinds, note, status, createdAt, reviewedAt }) => ({ id: oid, name, phone, kinds, note, status, createdAt, reviewedAt })),
  };
}

// ---------------------------------------------------------------- dashboard (F12) and incident page (F13)

// GET /api/admin/events — Server-Sent Events: the id of every incident that changes (architecture D12).
adminRouter.get('/events', (_req, res) => {
  openStream(res, (c) => ({ incidentId: c.incidentId }));
});

// GET /api/admin/incidents → {counts, incidents} ordered per BR-120
adminRouter.get('/incidents', async (_req, res) => {
  const [incidents, reports, assignments, offers] = await Promise.all([
    rows<IncidentRecord>(db.from('incidents').select('*').neq('status', 'MERGED'), 'Incident lookup failed'),
    rows<Pick<ReportRecord, 'incidentId' | 'audioPath' | 'channel'>>(db.from('reports').select('incident_id, audio_path, channel').not('incident_id', 'is', null), 'Report lookup failed'),
    allAssignments(),
    rows<Pick<HelpOfferRecord, 'incidentId'>>(db.from('help_offers').select('incident_id').eq('status', 'PENDING'), 'Help offer lookup failed'),
  ]);
  const codeOf = new Map(incidents.map((i) => [i.id, i.code]));
  const items = incidents.map((i) => listItem(
    i,
    reports.filter((r) => r.incidentId === i.id),
    assignments.filter((a) => a.incidentId === i.id),
    i.possibleDuplicateOf ? codeOf.get(i.possibleDuplicateOf) ?? null : null,
    offers.filter((o) => o.incidentId === i.id).length,
  ));
  const counts: Record<PriorityLevel, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  items.filter((i) => ACTIVE_STATUSES.includes(i.status)).forEach((i) => counts[i.priority]++);
  items.sort((a, b) =>
    priorityRank(b.priority) - priorityRank(a.priority) ||
    Number(b.escalationRecommended && !b.escalated) - Number(a.escalationRecommended && !a.escalated) ||
    a.createdAt.localeCompare(b.createdAt));
  res.json({ counts, incidents: items });
});

// GET /api/admin/incidents/:id → IncidentDetail
adminRouter.get('/incidents/:id', async (req, res) => {
  res.json(await detail(req.params.id));
});

// PATCH /api/admin/incidents/:id — edit (BR-100)
adminRouter.patch('/incidents/:id', async (req, res) => {
  const i = await getIncident(req.params.id);
  requireActive(i, 'edited');
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: Partial<IncidentRecord> = {};
  if ('type' in b) {
    if (!(INCIDENT_TYPES as readonly unknown[]).includes(b.type)) throw invalid('Unknown incident type.');
    patch.type = b.type as IncidentType;
  }
  if ('people' in b) {
    if (!(b.people === null || (Number.isInteger(b.people) && (b.people as number) >= 0 && (b.people as number) <= MAX_PEOPLE))) {
      throw invalid(`Number of people must be between 0 and ${MAX_PEOPLE}.`);
    }
    patch.people = b.people as number | null;
  }
  for (const flag of ['vulnerable', 'trapped', 'medical', 'danger'] as const) {
    if (flag in b) {
      if (typeof b[flag] !== 'boolean') throw invalid(`${flag} must be true or false.`);
      patch[flag] = b[flag] as boolean;
    }
  }
  if ('needs' in b) {
    if (!Array.isArray(b.needs) || !b.needs.every((n) => (NEEDS as readonly unknown[]).includes(n))) throw invalid('Needs contain an unknown value.');
    patch.needs = [...new Set(b.needs as Need[])];
  }
  if ('lat' in b || 'lng' in b) {
    const lat = b.lat ?? null;
    const lng = b.lng ?? null;
    const valid = (lat === null && lng === null) ||
      (typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180);
    if (!valid) throw invalid('Map pin needs a valid latitude and longitude.');
    patch.lat = lat as number | null;
    patch.lng = lng as number | null;
  }
  for (const key of ['locationText', 'publicArea', 'summary'] as const) {
    if (key in b) {
      if (b[key] !== null && typeof b[key] !== 'string') throw invalid(`${key} must be text.`);
      patch[key] = str(b[key]) || null;
    }
  }
  await updateIncident(i.id, patch);
  await addLog(i.id, 'Details edited by coordinator', false);
  await recomputeIncident(i.id);
  res.json(await detail(i.id));
});

// POST /verify {publicArea?}
adminRouter.post('/incidents/:id/verify', async (req, res) => {
  const i = await getIncident(req.params.id);
  if (!ACTIVE_STATUSES.includes(i.status) || i.verifiedAt) throw new ApiError('INVALID_STATE', 'This incident is already verified or closed.');
  const area = str(req.body?.publicArea);
  await updateIncident(i.id, {
    verifiedAt: nowIso(),
    ...(area ? { publicArea: area } : {}),
    ...(i.status === 'NEW' ? { status: 'VERIFIED' as const } : {}),
  });
  await addLog(i.id, 'Verified by the coordination team', true);
  await recomputeIncident(i.id);
  res.json(await detail(i.id));
});

/** Cancel the incident's active assignment, if any (reject/resolve side effect, BR-100). */
async function cancelActive(incidentId: string): Promise<void> {
  const a = activeOf((await allAssignments()).filter((x) => x.incidentId === incidentId));
  if (a) {
    await endAssignment(a, 'CANCELLED', null);
    await addLog(incidentId, 'Assignment cancelled', false);
  }
}

// POST /reject {reason}
adminRouter.post('/incidents/:id/reject', async (req, res) => {
  const i = await getIncident(req.params.id);
  requireActive(i, 'rejected');
  const reason = str(req.body?.reason);
  if (!reason) throw invalid('Add a reason for rejecting this report.');
  await cancelActive(i.id);
  await updateIncident(i.id, { status: 'REJECTED', rejectReason: reason });
  await addLog(i.id, `Rejected: ${reason}`, false);
  res.json(await detail(i.id));
});

// POST /override {level | null, reason?} — BR-28
adminRouter.post('/incidents/:id/override', async (req, res) => {
  const i = await getIncident(req.params.id);
  requireActive(i, 'changed');
  const level = req.body?.level ?? null;
  if (level !== null && !(PRIORITY_LEVELS as readonly unknown[]).includes(level)) throw invalid('Unknown priority level.');
  const reason = str(req.body?.reason);
  if (level && !reason) throw invalid('Add a reason for changing the priority.');
  await updateIncident(i.id, { priorityOverride: level, overrideReason: level ? reason : null });
  await addLog(i.id, level ? `Priority set to ${level}: ${reason}` : 'Priority override removed', false);
  await recomputeIncident(i.id); // escalation depends on the effective priority
  res.json(await detail(i.id));
});

// POST /escalate {note?} — BR-31 (simulated, no external call)
adminRouter.post('/incidents/:id/escalate', async (req, res) => {
  const i = await getIncident(req.params.id);
  requireActive(i, 'escalated');
  if (i.escalatedAt) throw new ApiError('INVALID_STATE', 'This incident has already been escalated.');
  await updateIncident(i.id, { escalatedAt: nowIso() });
  await addLog(i.id, 'Escalated to emergency services (simulated)', true);
  const note = str(req.body?.note);
  if (note) await addLog(i.id, `Escalation note: ${note}`, false);
  res.json(await detail(i.id));
});

// POST /resolve {note?}
adminRouter.post('/incidents/:id/resolve', async (req, res) => {
  const i = await getIncident(req.params.id);
  requireActive(i, 'resolved');
  await cancelActive(i.id);
  await updateIncident(i.id, { status: 'RESOLVED', resolvedAt: nowIso() });
  await addLog(i.id, 'This incident has been resolved', true);
  const note = str(req.body?.note);
  if (note) await addLog(i.id, `Resolution note: ${note}`, false);
  res.json(await detail(i.id));
});

// POST /merge {intoId} — BR-50…BR-52. Source :id is merged INTO intoId; returns the target.
adminRouter.post('/incidents/:id/merge', async (req, res) => {
  const s = await getIncident(req.params.id);
  const t = await getIncident(String(req.body?.intoId ?? ''));
  if (s.id === t.id || !ACTIVE_STATUSES.includes(s.status) || !ACTIVE_STATUSES.includes(t.status)) {
    throw new ApiError('INVALID_STATE', 'Both incidents must be open to merge them.');
  }
  const assignments = await allAssignments();
  if (activeOf(assignments.filter((a) => a.incidentId === s.id)) && activeOf(assignments.filter((a) => a.incidentId === t.id))) {
    throw new ApiError('INVALID_STATE', 'Cancel one of the active assignments first.');
  }
  for (const table of ['reports', 'assignments', 'allocations', 'messages', 'help_offers']) {
    const { error } = await db.from(table).update({ incident_id: t.id }).eq('incident_id', s.id);
    if (error) throw new Error(`Moving ${table} failed: ${error.message}`);
  }
  await updateIncident(t.id, { ...mergeFields(t, s), possibleDuplicateOf: t.possibleDuplicateOf === s.id ? null : t.possibleDuplicateOf });
  await updateIncident(s.id, { status: 'MERGED', mergedInto: t.id, possibleDuplicateOf: null });
  // Anything pointing at S as a possible duplicate now points at T (or nothing, if it is T).
  const { error } = await db.from('incidents').update({ possible_duplicate_of: t.id }).eq('possible_duplicate_of', s.id).neq('id', t.id);
  if (error) throw new Error(`Duplicate links update failed: ${error.message}`);
  await addLog(t.id, `Merged #${s.code} into this incident`, false);
  await addLog(t.id, 'Another report about the same situation was added', true);
  await addLog(s.id, `Merged into #${t.code}`, false);
  await recomputeIncident(t.id);
  res.json(await detail(t.id));
});

// POST /dismiss-duplicate
adminRouter.post('/incidents/:id/dismiss-duplicate', async (req, res) => {
  const i = await getIncident(req.params.id);
  if (!i.possibleDuplicateOf) throw new ApiError('INVALID_STATE', 'This incident is not marked as a possible duplicate.');
  await updateIncident(i.id, { possibleDuplicateOf: null });
  await addLog(i.id, 'Marked as not a duplicate', false);
  res.json(await detail(i.id));
});

// ---------------------------------------------------------------- volunteers (F14)

// POST /assign {volunteerId} — BR-60, BR-100
adminRouter.post('/incidents/:id/assign', async (req, res) => {
  const i = await getIncident(req.params.id);
  if (i.status !== 'NEW' && i.status !== 'VERIFIED') throw new ApiError('INVALID_STATE', 'Volunteers can only be assigned to new or verified incidents.');
  const assignments = await allAssignments();
  if (activeOf(assignments.filter((a) => a.incidentId === i.id))) {
    throw new ApiError('INVALID_STATE', 'This incident already has a volunteer. Cancel that assignment first.');
  }
  const volunteerId = req.body?.volunteerId;
  const [v] = isUuid(volunteerId)
    ? await rows<ProfileRecord>(db.from('profiles').select('*').eq('id', volunteerId).eq('role', 'VOLUNTEER'), 'Volunteer lookup failed')
    : [];
  if (!v) throw new ApiError('NOT_FOUND', 'This volunteer does not exist.');
  if (!isEligible(v, i.id, assignments)) throw new ApiError('INVALID_STATE', `${v.name} is not available for this incident.`);
  await createAssignment(i, v, null);
  await addLog(i.id, `Volunteer ${v.name} assigned`, false);
  // A coordinator chose this volunteer: a person has judged the incident (BR-165), so it may reach the public map.
  await updateIncident(i.id, i.autoDispatchedAt ? { autoDispatchedAt: null } : {});
  res.json(await detail(i.id));
});

// ---------------------------------------------------------------- community help (F29, BR-172, BR-173)

// POST /api/admin/incidents/:id/open {open: boolean, task?: string} — let anyone join from the public map (BR-172)
adminRouter.post('/incidents/:id/open', async (req, res) => {
  const i = await getIncident(req.params.id);
  const open = req.body?.open === true;
  if (open) {
    requireActive(i, 'opened to anyone');
    const reports = await reportsOf(i.id);
    if (!isPublic({ ...i, effectivePriority: i.priority, reportCount: reports.length })) {
      throw new ApiError('INVALID_STATE', 'Verify this incident first: only incidents on the public map can be opened to anyone.');
    }
    const task = checkPublicTask(req.body?.task);
    if (!task) throw invalid(`Describe the task and where to meet (5–${PUBLIC_TASK_MAX} characters). Everyone on the map can read it.`);
    await updateIncident(i.id, { openToAll: true, publicTask: task });
    await addLog(i.id, `Opened to anyone on the public map: "${task}"`, false);
  } else if (i.openToAll) {
    await updateIncident(i.id, { openToAll: false });
    await addLog(i.id, 'Closed to the public: offers are reviewed again', false);
  }
  res.json(await detail(i.id));
});

async function reviewOffer(id: string, status: 'ACCEPTED' | 'DECLINED'): Promise<IncidentDetail> {
  const [o] = isUuid(id) ? await rows<HelpOfferRecord>(db.from('help_offers').select('*').eq('id', id), 'Help offer lookup failed') : [];
  if (!o) throw new ApiError('NOT_FOUND', 'This help offer does not exist.');
  if (o.status !== 'PENDING') throw new ApiError('INVALID_STATE', 'This offer has already been answered.');
  const { data, error } = await db.from('help_offers').update({ status, reviewed_at: nowIso() }).eq('id', o.id).eq('status', 'PENDING').select('id');
  if (error) throw new Error(`Help offer update failed: ${error.message}`);
  if (!data?.length) throw new ApiError('INVALID_STATE', 'This offer has already been answered.');
  const i = await getIncident(o.incidentId);
  if (status === 'ACCEPTED') {
    await addLog(i.id, `Help offer from ${o.name} accepted`, false);
    await addLog(i.id, 'A helper from the community has been arranged by the coordination team', true);
    void sendSms(o.phone, `HopeGrid: thank you, ${o.name}. The coordination team accepted your offer to help with #${i.code} and will call you with the details.`);
  } else {
    await addLog(i.id, `Help offer from ${o.name} declined`, false);
    void sendSms(o.phone, `HopeGrid: thank you for offering to help with #${i.code}. It is covered for now; we may contact you for other tasks.`);
  }
  return detail(i.id);
}

// POST /api/admin/help-offers/:id/accept | /decline (BR-173)
adminRouter.post('/help-offers/:id/accept', async (req, res) => {
  res.json(await reviewOffer(req.params.id, 'ACCEPTED'));
});
adminRouter.post('/help-offers/:id/decline', async (req, res) => {
  res.json(await reviewOffer(req.params.id, 'DECLINED'));
});

// GET /api/admin/dispatch → DispatchState; PUT {mode, threshold, responseMinutes} → DispatchState (F28, BR-160)
adminRouter.get('/dispatch', async (_req, res) => {
  res.json(await dispatchState());
});
adminRouter.put('/dispatch', async (req, res) => {
  await saveDispatchSettings(req.body);
  await runDispatch(); // a new mode or threshold applies at once
  res.json(await dispatchState());
});

// POST /api/admin/assignments/:id/cancel
adminRouter.post('/assignments/:id/cancel', async (req, res) => {
  const [a] = isUuid(req.params.id)
    ? await rows<AssignmentRecord>(db.from('assignments').select('*').eq('id', req.params.id), 'Assignment lookup failed')
    : [];
  if (!a) throw new ApiError('NOT_FOUND', 'This assignment does not exist.');
  if (!ACTIVE_ASSIGNMENT.includes(a.status)) throw new ApiError('INVALID_STATE', 'This assignment has already ended.');
  await endAssignment(a, 'CANCELLED', null);
  await addLog(a.incidentId, 'Assignment cancelled', false);
  res.json(await detail(a.incidentId));
});

// ---------------------------------------------------------------- resources (F20)

async function getResource(id: string): Promise<ResourceRecord> {
  const [r] = isUuid(id) ? await rows<ResourceRecord>(db.from('resources').select('*').eq('id', id), 'Resource lookup failed') : [];
  if (!r) throw new ApiError('NOT_FOUND', 'This resource does not exist.');
  return r;
}
const toResource = ({ id, name, category, quantity, unit, locationText }: ResourceRecord) => ({ id, name, category, quantity, unit, locationText: locationText ?? '' });

// POST /allocate {resourceId, quantity} — BR-130
adminRouter.post('/incidents/:id/allocate', async (req, res) => {
  const i = await getIncident(req.params.id);
  requireActive(i, 'given resources');
  const r = await getResource(String(req.body?.resourceId ?? ''));
  const quantity = req.body?.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) throw invalid('Quantity must be a whole number of at least 1.');
  if (quantity > r.quantity) throw new ApiError('INSUFFICIENT_QUANTITY', `Only ${r.quantity} available.`);
  // Only subtract if nobody changed the stock since we read it.
  const { data, error } = await db.from('resources').update({ quantity: r.quantity - quantity }).eq('id', r.id).eq('quantity', r.quantity).select('id');
  if (error) throw new Error(`Resource update failed: ${error.message}`);
  if (!data.length) throw new ApiError('INSUFFICIENT_QUANTITY', 'The stock just changed. Check the available quantity and try again.');
  const { error: allocError } = await db.from('allocations').insert({ resource_id: r.id, incident_id: i.id, quantity });
  if (allocError) throw new Error(`Allocation insert failed: ${allocError.message}`);
  await addLog(i.id, 'Relief supplies allocated', true);
  await addLog(i.id, `Allocated ${quantity} ${r.unit} ${r.name}`, false);
  await updateIncident(i.id, {});
  res.json(await detail(i.id));
});

function validateResource(b: Record<string, unknown>, partial: boolean): Partial<ResourceInput> {
  const out: Partial<ResourceInput> = {};
  if (!partial || 'name' in b) {
    if (!str(b.name)) throw invalid('Give the resource a name.');
    out.name = str(b.name);
  }
  if (!partial || 'category' in b) {
    if (!(RESOURCE_CATEGORIES as readonly unknown[]).includes(b.category)) throw invalid('Choose a category.');
    out.category = b.category as ResourceInput['category'];
  }
  if (!partial || 'quantity' in b) {
    if (!Number.isInteger(b.quantity) || (b.quantity as number) < 0) throw invalid('Quantity must be a whole number of 0 or more.');
    out.quantity = b.quantity as number;
  }
  if (!partial || 'unit' in b) out.unit = str(b.unit);
  if (!partial || 'locationText' in b) out.locationText = str(b.locationText);
  return out;
}

adminRouter.get('/resources', async (_req, res) => {
  res.json((await rows<ResourceRecord>(db.from('resources').select('*').order('name'), 'Resource lookup failed')).map(toResource));
});

adminRouter.post('/resources', async (req, res) => {
  const input = validateResource(req.body ?? {}, false);
  const { data, error } = await db.from('resources').insert(toRow(input)).select('*').single();
  if (error) throw new Error(`Resource insert failed: ${error.message}`);
  res.json(toResource(fromRow<ResourceRecord>(data)));
});

adminRouter.patch('/resources/:id', async (req, res) => {
  const r = await getResource(req.params.id);
  const patch = validateResource(req.body ?? {}, true);
  const { data, error } = await db.from('resources').update(toRow(patch)).eq('id', r.id).select('*').single();
  if (error) throw new Error(`Resource update failed: ${error.message}`);
  res.json(toResource(fromRow<ResourceRecord>(data)));
});

// ---------------------------------------------------------------- volunteer registration (F26, BR-150)

const APPLICATION_STATUSES: ApplicationStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

async function getApplication(id: string): Promise<ApplicationRecord> {
  const [a] = isUuid(id) ? await rows<ApplicationRecord>(db.from('volunteer_applications').select('*').eq('id', id), 'Application lookup failed') : [];
  if (!a) throw new ApiError('NOT_FOUND', 'This application does not exist.');
  return a;
}

// GET /api/admin/applications?status=PENDING|APPROVED|REJECTED → VolunteerApplication[] (newest first)
adminRouter.get('/applications', async (req, res) => {
  const status = String(req.query.status ?? 'PENDING') as ApplicationStatus;
  if (!APPLICATION_STATUSES.includes(status)) throw invalid('Unknown application status.');
  const list = await rows<ApplicationRecord>(
    db.from('volunteer_applications').select('*').eq('status', status).order('created_at', { ascending: false }), 'Application lookup failed');
  const urls = await signedUrls(list.map((a) => a.proofPath));
  res.json(list.map((a): VolunteerApplication => ({
    id: a.id, name: a.name, email: a.email, phone: a.phone, skills: a.skills, equipment: a.equipment, vehicle: a.vehicle,
    locationText: a.locationText, hasLocation: a.lat !== null, status: a.status, rejectReason: a.rejectReason,
    proofUrl: a.proofPath ? urls.get(a.proofPath) ?? null : null, createdAt: a.createdAt, reviewedAt: a.reviewedAt,
  })));
});

// POST /api/admin/applications/:id/approve → the applicant becomes a volunteer (profile row) and can log in
adminRouter.post('/applications/:id/approve', async (req, res) => {
  const a = await getApplication(req.params.id);
  if (a.status !== 'PENDING') throw new ApiError('INVALID_STATE', 'This application has already been reviewed.');
  const { error } = await db.from('profiles').insert(toRow({
    id: a.userId, name: a.name, email: a.email, role: 'VOLUNTEER', phone: a.phone, skills: a.skills, equipment: a.equipment,
    vehicle: a.vehicle, availability: 'AVAILABLE', lat: a.lat, lng: a.lng,
  }));
  if (error) throw new Error(`Creating the volunteer profile failed: ${error.message}`);
  const upd = await db.from('volunteer_applications')
    .update({ status: 'APPROVED', reviewed_by: currentUser(req).id, reviewed_at: nowIso() }).eq('id', a.id);
  if (upd.error) throw new Error(`Application update failed: ${upd.error.message}`);
  res.json({ ok: true });
});

// POST /api/admin/applications/:id/reject {reason} → login removed (they may apply again), ID proof deleted
adminRouter.post('/applications/:id/reject', async (req, res) => {
  const a = await getApplication(req.params.id);
  if (a.status !== 'PENDING') throw new ApiError('INVALID_STATE', 'This application has already been reviewed.');
  const reason = str(req.body?.reason);
  if (!reason) throw invalid('Add a reason for rejecting this application.');
  const removed = await db.auth.admin.deleteUser(a.userId);
  if (removed.error) throw new Error(`Removing the login failed: ${removed.error.message}`);
  if (a.proofPath) await removeFiles([a.proofPath]);
  const upd = await db.from('volunteer_applications').update({
    status: 'REJECTED', reject_reason: reason, proof_path: null, reviewed_by: currentUser(req).id, reviewed_at: nowIso(),
  }).eq('id', a.id);
  if (upd.error) throw new Error(`Application update failed: ${upd.error.message}`);
  res.json({ ok: true });
});

// GET /api/admin/volunteers → VolunteerListItem[] (staff-only: includes phone numbers)
adminRouter.get('/volunteers', async (_req, res) => {
  const list = await rows<ProfileRecord>(db.from('profiles').select('*').eq('role', 'VOLUNTEER').order('name'), 'Volunteer lookup failed');
  res.json(list.map((p): VolunteerListItem => ({
    id: p.id, name: p.name, email: p.email, phone: p.phone, skills: p.skills, equipment: p.equipment, vehicle: p.vehicle, availability: p.availability,
  })));
});
