// server/routes/admin.ts — all /api/admin/* routes (role ADMIN). Status changes follow BR-100…BR-104 and are
// validated here before every change (AR-16); every incident change writes a log (AR-17).
import { Router } from 'express';
import { MAX_PEOPLE } from '../../shared/constants';
import { distanceBetween, findRelated, mergeFields } from '../../shared/linking';
import { confidenceBand, effectivePriority, priorityRank } from '../../shared/scoring';
import {
  ACTIVE_ASSIGNMENT, ACTIVE_STATUSES, ApiError, INCIDENT_TYPES, NEEDS, PRIORITY_LEVELS, RESOURCE_CATEGORIES,
  type AllocationRecord, type AssignmentRecord, type IncidentDetail, type IncidentListItem, type IncidentRecord,
  type IncidentType, type LogRecord, type Need, type PriorityLevel, type ProfileRecord, type ReportRecord,
  type ResourceInput, type ResourceRecord,
} from '../../shared/types';
import { humanize, isEligible, rankVolunteers } from '../../shared/volunteerMatch';
import { requireRole } from '../auth';
import { fromRow, fromRows, toRow } from '../mappers';
import {
  addLog, allAssignments, endAssignment, getIncident, isUuid, recomputeIncident, reportsOf, toLink, updateIncident,
} from '../pipeline';
import { signedUrls } from '../storage';
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

function listItem(i: IncidentRecord, reports: Pick<ReportRecord, 'audioPath'>[], asg: AssignmentRecord[], dupCode: string | null): IncidentListItem {
  const active = activeOf(asg);
  const latest = asg[asg.length - 1];
  return {
    id: i.id, code: i.code, type: i.type, status: i.status,
    priority: effectivePriority(i.priority, i.priorityOverride), overridden: i.priorityOverride !== null,
    confidence: i.confidence, confidenceBand: confidenceBand(i.confidence), people: i.people, locationText: i.locationText,
    reportCount: reports.length, hasVoice: reports.some((r) => !!r.audioPath), possibleDuplicateCode: dupCode,
    // BR-103 derived flags
    needsReassign: (i.status === 'NEW' || i.status === 'VERIFIED') && !active && asg.some((a) => a.status === 'DECLINED' || a.status === 'UNABLE'),
    readyToResolve: i.status === 'IN_PROGRESS' && latest?.status === 'DONE',
    escalationRecommended: i.escalationRecommended, escalated: i.escalatedAt !== null,
    createdAt: i.createdAt, updatedAt: i.updatedAt,
  };
}

async function detail(id: string): Promise<IncidentDetail> {
  const i = await getIncident(id);
  const [reports, assignments, volunteers, allocations, resources, logs, messages, others] = await Promise.all([
    reportsOf(id),
    allAssignments(),
    rows<ProfileRecord>(db.from('profiles').select('*').eq('role', 'VOLUNTEER'), 'Volunteer lookup failed'),
    rows<AllocationRecord>(db.from('allocations').select('*').eq('incident_id', id).order('created_at'), 'Allocation lookup failed'),
    rows<ResourceRecord>(db.from('resources').select('*'), 'Resource lookup failed'),
    rows<LogRecord>(db.from('incident_logs').select('*').eq('incident_id', id).order('created_at', { ascending: false }), 'Log lookup failed'),
    messagesWhere('incident_id', id),
    rows<IncidentRecord>(db.from('incidents').select('*').neq('status', 'MERGED').neq('id', id), 'Incident lookup failed'),
  ]);
  const asg = assignments.filter((a) => a.incidentId === id);
  const dup = i.possibleDuplicateOf ? others.find((o) => o.id === i.possibleDuplicateOf) ?? null : null;
  const canSuggest = (i.status === 'NEW' || i.status === 'VERIFIED') && !activeOf(asg);
  const urls = await signedUrls(reports.flatMap((r) => [r.photoPath, r.audioPath]));
  const chatMessages = await toChatMessages(messages);
  const nameOf = (vid: string) => volunteers.find((v) => v.id === vid)?.name ?? 'Volunteer';

  return {
    ...listItem(i, reports, asg, dup?.code ?? null),
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
      locationText: r.locationText, createdAt: r.createdAt, receivedAt: r.receivedAt,
    })),
    possibleDuplicate: dup ? { id: dup.id, code: dup.code, type: dup.type, summary: dup.summary, distanceM: distanceBetween(i, dup) } : null,
    // BR-45: computed on read, never stored. Only type, place and time matter here.
    related: findRelated(toLink(i, []), others.map((o) => toLink(o, [])), humanize)
      .map(({ id: rid, code, type, text }) => ({ id: rid, code, type, text })),
    suggestions: canSuggest ? rankVolunteers(i, volunteers, assignments) : [],
    assignments: asg.map((a) => ({ id: a.id, volunteerId: a.volunteerId, volunteerName: nameOf(a.volunteerId), status: a.status, reason: a.reason, updatedAt: a.updatedAt })),
    allocations: allocations.map((a) => {
      const res = resources.find((r) => r.id === a.resourceId);
      return { id: a.id, resourceName: res?.name ?? 'Resource', quantity: a.quantity, unit: res?.unit ?? '', createdAt: a.createdAt };
    }),
    logs: logs.map((l) => ({ at: l.createdAt, text: l.text, public: l.public })),
    chats: reports.map((r, n) => ({
      reportId: r.id, label: `Reporter ${n + 1}`,
      messages: chatMessages.filter((_, k) => messages[k].reportId === r.id),
    })),
  };
}

// ---------------------------------------------------------------- dashboard (F12) and incident page (F13)

// GET /api/admin/incidents → {counts, incidents} ordered per BR-120
adminRouter.get('/incidents', async (_req, res) => {
  const [incidents, reports, assignments] = await Promise.all([
    rows<IncidentRecord>(db.from('incidents').select('*').neq('status', 'MERGED'), 'Incident lookup failed'),
    rows<Pick<ReportRecord, 'incidentId' | 'audioPath'>>(db.from('reports').select('incident_id, audio_path').not('incident_id', 'is', null), 'Report lookup failed'),
    allAssignments(),
  ]);
  const codeOf = new Map(incidents.map((i) => [i.id, i.code]));
  const items = incidents.map((i) => listItem(
    i,
    reports.filter((r) => r.incidentId === i.id),
    assignments.filter((a) => a.incidentId === i.id),
    i.possibleDuplicateOf ? codeOf.get(i.possibleDuplicateOf) ?? null : null,
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
  for (const table of ['reports', 'assignments', 'allocations', 'messages']) {
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
  const { error } = await db.from('assignments').insert({ incident_id: i.id, volunteer_id: v.id, status: 'ASSIGNED' });
  if (error) throw new Error(`Assignment insert failed: ${error.message}`);
  await addLog(i.id, `Volunteer ${v.name} assigned`, false);
  await updateIncident(i.id, {});
  res.json(await detail(i.id));
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
