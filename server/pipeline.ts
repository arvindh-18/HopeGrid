// server/pipeline.ts — report processing and incident recompute (architecture §11.2), plus the incident
// helpers every route shares: logs (BR-110), recompute and ending an assignment (BR-102, BR-104).
import { randomInt } from 'node:crypto';
import { CODE_ALPHABET, INCIDENT_CODE_LENGTH } from '../shared/constants';
import { findDuplicate, type LinkIncident } from '../shared/linking';
import { computeConfidence, computeEscalation, computePriority, effectivePriority } from '../shared/scoring';
import {
  ACTIVE_STATUSES, ApiError,
  type AssignmentRecord, type IncidentRecord, type ReportRecord,
} from '../shared/types';
import { structureText } from './ai';
import { fromRow, fromRows, toRow } from './mappers';
import { db } from './supabase';
import { transcribe } from './transcribe';

const nowIso = () => new Date().toISOString();
const UNIQUE_VIOLATION = '23505';

function check<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

// ---------------------------------------------------------------- loaders
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export async function getIncident(id: string): Promise<IncidentRecord> {
  if (!isUuid(id)) throw new ApiError('NOT_FOUND', 'This incident does not exist.');
  const data = check(await db.from('incidents').select('*').eq('id', id).maybeSingle(), 'Incident lookup failed');
  if (!data) throw new ApiError('NOT_FOUND', 'This incident does not exist.');
  return fromRow<IncidentRecord>(data);
}

/** Reports of an incident, oldest received first ("Report 1", "Reporter 1"…). */
export async function reportsOf(incidentId: string): Promise<ReportRecord[]> {
  const data = check(await db.from('reports').select('*').eq('incident_id', incidentId).order('received_at'), 'Report lookup failed');
  return fromRows<ReportRecord>(data);
}

/** Assignments of an incident, oldest first (newest last). */
export async function assignmentsOf(incidentId: string): Promise<AssignmentRecord[]> {
  const data = check(await db.from('assignments').select('*').eq('incident_id', incidentId).order('created_at'), 'Assignment lookup failed');
  return fromRows<AssignmentRecord>(data);
}

export async function allAssignments(): Promise<AssignmentRecord[]> {
  return fromRows<AssignmentRecord>(check(await db.from('assignments').select('*').order('created_at'), 'Assignment lookup failed'));
}

// ---------------------------------------------------------------- writes
export async function updateIncident(id: string, patch: Partial<IncidentRecord>): Promise<void> {
  check(await db.from('incidents').update(toRow({ ...patch, updatedAt: nowIso() })).eq('id', id), 'Incident update failed');
}

/** BR-110 — every incident-changing action writes a log row. P = public (victim sees it), A = admin only. */
export async function addLog(incidentId: string, text: string, isPublic: boolean): Promise<void> {
  check(await db.from('incident_logs').insert({ incident_id: incidentId, text, public: isPublic }), 'Log insert failed');
}

export function newIncidentCode(): string {
  let code = '';
  for (let n = 0; n < INCIDENT_CODE_LENGTH; n++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** recomputeIncident — confidence (BR-20), priority (BR-25), escalation (BR-30). Override is never touched (BR-28). */
export async function recomputeIncident(id: string): Promise<void> {
  const i = await getIncident(id);
  const reports = await reportsOf(id);
  const c = computeConfidence(
    { verifiedAt: i.verifiedAt, onSiteAt: i.onSiteAt },
    reports.map((r) => ({ deviceId: r.deviceId, hasPhoto: !!r.photoPath, receivedAt: r.receivedAt, phoneVerified: r.phoneVerified })),
  );
  const p = computePriority(i);
  const e = computeEscalation({ ...i, effectivePriority: effectivePriority(p.level, i.priorityOverride) });
  await updateIncident(id, {
    confidence: c.score, confidenceReasons: c.reasons,
    priorityScore: p.score, priority: p.level, priorityReasons: p.reasons,
    escalationRecommended: e.recommended, escalationReasons: e.reasons,
  });
}

/** Volunteer back to AVAILABLE if the system had set BUSY (BR-104). */
export async function releaseVolunteer(volunteerId: string): Promise<void> {
  check(await db.from('profiles').update({ availability: 'AVAILABLE' }).eq('id', volunteerId).eq('availability', 'BUSY'), 'Volunteer update failed');
}

/** Ends an active assignment as DECLINED / UNABLE / CANCELLED with BR-102 + BR-104 side effects. */
export async function endAssignment(a: AssignmentRecord, status: 'DECLINED' | 'UNABLE' | 'CANCELLED', reason: string | null): Promise<void> {
  check(await db.from('assignments').update({ status, reason, updated_at: nowIso() }).eq('id', a.id), 'Assignment update failed');
  await releaseVolunteer(a.volunteerId);
  const i = await getIncident(a.incidentId);
  await updateIncident(i.id, i.status === 'IN_PROGRESS' ? { status: i.verifiedAt ? 'VERIFIED' : 'NEW' } : {});
}

/** Incident + its reports → the shape used by duplicate/related rules (BR-40…BR-45). */
export function toLink(i: IncidentRecord, reports: ReportRecord[]): LinkIncident {
  return {
    id: i.id, code: i.code, type: i.type, status: i.status, lat: i.lat, lng: i.lng, createdAt: i.createdAt,
    places: [...new Set(reports.flatMap((r) => r.extraction?.places ?? []))],
    text: [i.summary ?? '', ...reports.map((r) => `${r.text} ${r.transcript ?? ''}`)].join(' '),
    possibleDuplicateOf: i.possibleDuplicateOf,
  };
}

async function activeLinks(): Promise<LinkIncident[]> {
  const incidents = fromRows<IncidentRecord>(check(await db.from('incidents').select('*').in('status', ACTIVE_STATUSES), 'Incident lookup failed'));
  if (incidents.length === 0) return [];
  const reports = fromRows<ReportRecord>(check(await db.from('reports').select('*').in('incident_id', incidents.map((i) => i.id)), 'Report lookup failed'));
  return incidents.map((i) => toLink(i, reports.filter((r) => r.incidentId === i.id)));
}

// ---------------------------------------------------------------- processing
const inFlight = new Set<string>();

/** architecture §11.2 steps 1–8. Never awaited by the request that created the report (D9). */
export async function processReport(reportId: string): Promise<void> {
  if (inFlight.has(reportId)) return;
  inFlight.add(reportId);
  try {
    const row = check(await db.from('reports').select('*').eq('id', reportId).maybeSingle(), 'Report lookup failed');
    if (!row) return;
    const r = fromRow<ReportRecord>(row);
    if (r.processingStatus !== 'PENDING') return;
    if (r.incidentId) {
      // Stopped after the incident was created: finish the scores without creating a second incident.
      await recomputeIncident(r.incidentId);
      check(await db.from('reports').update({ processing_status: 'DONE' }).eq('id', r.id), 'Report update failed');
      return;
    }

    // 1. Transcribe (BR-12). Failure never stops processing.
    let transcript: string | null = null;
    let transcriptStatus = r.transcriptStatus;
    if (r.audioPath) {
      try {
        transcript = await transcribe(r.audioPath);
        transcriptStatus = 'DONE';
      } catch (e) {
        console.warn(`Transcription failed for report ${r.id}: ${e instanceof Error ? e.message : e}`);
        transcriptStatus = 'FAILED';
      }
    }

    // 2–3. Structure text + transcript (BR-10, BR-11).
    const description = [r.text, transcript].filter((s) => s && s.trim()).join('\n');
    const { extraction, source } = await structureText(description);

    // 4. Victim input overrides AI (BR-13).
    if (r.people !== null) extraction.people = r.people;
    extraction.needs = [...new Set([...extraction.needs, ...r.needs])];

    // 5. Create the incident (code regenerated on collision, BR-01).
    const incident: Partial<IncidentRecord> = {
      type: extraction.type, lat: r.lat, lng: r.lng,
      locationText: r.locationText ?? extraction.places[0] ?? null,
      people: extraction.people,
      vulnerable: extraction.vulnerable || extraction.mobilityIssue,
      trapped: extraction.trapped, medical: extraction.medical, danger: extraction.danger,
      needs: extraction.needs, summary: extraction.summary || null, status: 'NEW',
      createdAt: r.receivedAt, updatedAt: nowIso(),
    };
    let created: IncidentRecord | null = null;
    for (let attempt = 0; !created; attempt++) {
      const res = await db.from('incidents').insert(toRow({ ...incident, code: newIncidentCode() })).select('*').single();
      if (res.error?.code === UNIQUE_VIOLATION && attempt < 5) continue;
      created = fromRow<IncidentRecord>(check(res, 'Incident insert failed'));
    }

    check(await db.from('reports').update(toRow({
      incidentId: created.id, transcript, transcriptStatus, extraction, aiSource: source,
    })).eq('id', r.id), 'Report update failed');

    await addLog(created.id, 'Report received', true);
    await addLog(created.id, source === 'AI' ? 'Structured by AI' : 'Structured by keyword fallback (AI unavailable)', false);
    if (transcriptStatus === 'FAILED') await addLog(created.id, 'Voice note could not be transcribed — listen to it', false);

    // 6. Possible duplicate (BR-40…BR-43). Never merged automatically.
    const links = await activeLinks();
    const self = links.find((l) => l.id === created.id);
    const dup = self ? findDuplicate(self, links) : null;
    if (dup) await updateIncident(created.id, { possibleDuplicateOf: dup.id });

    // 7–8.
    await recomputeIncident(created.id);
    check(await db.from('reports').update({ processing_status: 'DONE' }).eq('id', r.id), 'Report update failed');
  } catch (e) {
    console.error(`Processing report ${reportId} failed:`, e);
    await db.from('reports').update({ processing_status: 'FAILED' }).eq('id', reportId).eq('processing_status', 'PENDING');
  } finally {
    inFlight.delete(reportId);
  }
}

/** On server start: process every PENDING report, oldest first (D9). */
export async function processPendingReports(): Promise<void> {
  const data = check(await db.from('reports').select('id').eq('processing_status', 'PENDING').order('received_at'), 'Pending lookup failed');
  for (const { id } of data ?? []) await processReport(id);
}
