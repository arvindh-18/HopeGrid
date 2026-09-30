// server/pipeline.ts — report processing and incident recompute (architecture §11.2), later details for a report
// (BR-07), plus the incident helpers every route shares: logs (BR-110), recompute and ending an assignment
// (BR-102, BR-104).
import { randomInt } from 'node:crypto';
import { CODE_ALPHABET, INCIDENT_CODE_LENGTH } from '../shared/constants';
import { findDuplicate, laterFacts, type LinkIncident } from '../shared/linking';
import { computeConfidence, computeEscalation, computePriority, effectivePriority } from '../shared/scoring';
import {
  ACTIVE_STATUSES, ApiError,
  type AssignmentRecord, type IncidentRecord, type ReportRecord, type TranscriptStatus,
} from '../shared/types';
import { humanize } from '../shared/volunteerMatch';
import { structureText } from './ai';
import { emitChange } from './events';
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
  emitChange({ incidentId: id });
}

/** BR-110 — every incident-changing action writes a log row. P = public (victim sees it), A = admin only. */
export async function addLog(incidentId: string, text: string, isPublic: boolean): Promise<void> {
  check(await db.from('incident_logs').insert({ incident_id: incidentId, text, public: isPublic }), 'Log insert failed');
  emitChange({ incidentId });
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

// ---------------------------------------------------------------- processing queue (D9)
// Reports are processed in the background, at most MAX_CONCURRENT at a time (Whisper and the LLM each already run
// one job at a time; two workers let one report's database work overlap another's model work). The queue lives in
// memory but is durable through reports.processing_status: PENDING and FAILED reports are queued again at startup
// and by a periodic sweep, so a restart or a database outage delays a report but never loses it.
const MAX_CONCURRENT = 2;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000]; // after a failed attempt; later retries come from the sweep
const SWEEP_MS = 10 * 60_000;
const MAX_ATTEMPTS = 10; // per server run; a restart gives a report fresh attempts

const waiting: string[] = [];
const inFlight = new Set<string>();
const failures = new Map<string, number>(); // report id → failed attempts in this run
let idleWaiters: (() => void)[] = [];
let sweeper: ReturnType<typeof setInterval> | null = null;

/** Queue a report for processing. A report already waiting or being processed is not added twice. */
export function enqueueReport(reportId: string): void {
  if (inFlight.has(reportId) || waiting.includes(reportId)) return;
  waiting.push(reportId);
  pump();
}

/**
 * Changes a stored report — the full report after an SMS, or a follow-up SMS (BR-07) — then queues it again. A report
 * that is being processed right now must not change underneath the pipeline: the caller gets a retryable error
 * (500), so the phone's outbox or the SMS gateway simply sends again a little later.
 */
export async function changeReport(reportId: string, change: () => Promise<void>): Promise<void> {
  if (inFlight.has(reportId)) throw new ApiError('SERVER_ERROR', 'This report is being processed right now. Please try again in a moment.');
  inFlight.add(reportId); // processReport skips it until the change is written
  try {
    await change();
  } finally {
    inFlight.delete(reportId);
    enqueueReport(reportId);
  }
}

/** At startup: say so plainly when the database is missing columns added by a newer schema.sql. */
export async function checkSchema(): Promise<void> {
  const { error } = await db.from('reports').select('channel, pending_media, completed_at').limit(1);
  if (error && /column|schema cache/i.test(error.message)) {
    throw new Error(`The database is missing new columns (${error.message}). Run supabase/schema.sql again in the Supabase SQL editor: it is safe to re-run.`);
  }
}

/** For monitoring and tests. */
export const queueState = () => ({ waiting: waiting.length, running: inFlight.size, failing: failures.size });

function pump(): void {
  while (inFlight.size < MAX_CONCURRENT && waiting.length) void processReport(waiting.shift()!);
  if (inFlight.size === 0 && waiting.length === 0) {
    idleWaiters.forEach((resolve) => resolve());
    idleWaiters = [];
  }
}

const idle = () => new Promise<void>((resolve) => {
  if (inFlight.size === 0 && waiting.length === 0) resolve();
  else idleWaiters.push(resolve);
});

/**
 * On server start and then every SWEEP_MS: queue every PENDING or FAILED report, oldest first, and wait until the
 * queue is empty (D9 — nothing is lost on restart).
 */
export async function processPendingReports(): Promise<void> {
  if (!sweeper) {
    sweeper = setInterval(() => {
      processPendingReports().catch((e) => console.error('Report sweep failed:', e));
    }, SWEEP_MS);
    sweeper.unref();
  }
  const data = check(await db.from('reports').select('id').in('processing_status', ['PENDING', 'FAILED']).order('received_at'), 'Pending lookup failed');
  for (const { id } of data ?? []) if ((failures.get(id) ?? 0) < MAX_ATTEMPTS) enqueueReport(id);
  await idle();
}

/**
 * A previous attempt may have created the incident and then failed before linking this report to it (PostgREST
 * gives no transaction across the two writes). That incident was created with created_at = this report's
 * received_at and has no reports: reuse it instead of creating a second one.
 */
async function orphanIncidentOf(r: ReportRecord): Promise<IncidentRecord | null> {
  const found = fromRows<IncidentRecord>(check(await db.from('incidents').select('*').eq('created_at', r.receivedAt), 'Incident lookup failed'));
  for (const i of found) {
    const linked = check(await db.from('reports').select('id').eq('incident_id', i.id), 'Report lookup failed');
    if (!linked?.length) return i;
  }
  return null;
}

/** Step 1 (BR-12): what the voice note says, transcribed now if it hasn't been yet. Failure never stops processing. */
async function hear(r: ReportRecord): Promise<{ transcript: string | null; forAi: string | null; status: TranscriptStatus }> {
  if (!r.audioPath || r.transcriptStatus !== 'NONE') return { transcript: r.transcript, forAi: r.transcript, status: r.transcriptStatus };
  try {
    // Non-English speech also gets an English translation: staff see both, and the AI reads both — the original
    // keeps what a poor translation loses.
    const heard = await transcribe(r.audioPath);
    return {
      transcript: heard.english ? `${heard.text}\n\nEnglish: ${heard.english}` : heard.text,
      forAi: heard.english ? `${heard.text}\n(English machine translation, may be inaccurate: ${heard.english})` : heard.text,
      status: 'DONE',
    };
  } catch (e) {
    console.warn(`Transcription failed for report ${r.id}: ${e instanceof Error ? e.message : e}`);
    return { transcript: null, forAi: null, status: 'FAILED' };
  }
}

/** Steps 2–4: structure text + transcript (BR-10, BR-11); the victim's own answers win (BR-13). */
async function structure(r: ReportRecord, forAi: string | null) {
  const description = [r.text, forAi].filter((s) => s && s.trim()).join('\n');
  const result = await structureText(description);
  if (r.people !== null) result.extraction.people = r.people;
  result.extraction.needs = [...new Set([...result.extraction.needs, ...r.needs])];
  return result;
}

/**
 * BR-07: a linked report got new details (its extraction was cleared): read it again and add what's new to its
 * incident. Only adds (laterFacts); a closed incident gets a log only.
 */
async function addLaterDetails(r: ReportRecord, incidentId: string): Promise<void> {
  const heard = await hear(r);
  const { extraction, source } = await structure(r, heard.forAi);
  check(await db.from('reports').update(toRow({
    transcript: heard.transcript, transcriptStatus: heard.status, extraction, aiSource: source,
  })).eq('id', r.id), 'Report update failed');
  if (heard.status === 'FAILED' && r.transcriptStatus === 'NONE') await addLog(incidentId, 'Voice note could not be transcribed — listen to it', false);

  const i = await getIncident(incidentId);
  const { patch, added } = laterFacts(i, extraction, humanize);
  if (!ACTIVE_STATUSES.includes(i.status)) {
    if (added.length) await addLog(incidentId, `New details arrived after the incident was closed: ${added.join('; ')}`, false);
    return;
  }
  if (Object.keys(patch).length) await updateIncident(incidentId, patch);
  if (added.length) await addLog(incidentId, `New details added: ${added.join('; ')}`, false);
}

/** architecture §11.2 steps 1–8, for one report. Run through enqueueReport(), never awaited by the request (D9). */
export async function processReport(reportId: string): Promise<void> {
  if (inFlight.has(reportId)) return;
  inFlight.add(reportId);
  try {
    const row = check(await db.from('reports').select('*').eq('id', reportId).maybeSingle(), 'Report lookup failed');
    if (!row) return;
    const r = fromRow<ReportRecord>(row);
    if (r.processingStatus === 'DONE') return;
    if (r.incidentId) {
      // Linked already. Either processing stopped before DONE (finish the scores without a second incident), or new
      // details arrived later and cleared the extraction (BR-07): read them first.
      if (!r.extraction) await addLaterDetails(r, r.incidentId);
      await recomputeIncident(r.incidentId);
      check(await db.from('reports').update({ processing_status: 'DONE' }).eq('id', r.id), 'Report update failed');
      emitChange({ incidentId: r.incidentId, reportId: r.id });
      failures.delete(r.id);
      return;
    }

    // 1–4. Transcribe, structure, victim input overrides AI.
    const { transcript, forAi, status: transcriptStatus } = await hear(r);
    const { extraction, source } = await structure(r, forAi);

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
    let created = await orphanIncidentOf(r);
    if (created) await updateIncident(created.id, incident);
    for (let attempt = 0; !created; attempt++) {
      const res = await db.from('incidents').insert(toRow({ ...incident, code: newIncidentCode() })).select('*').single();
      if (res.error?.code === UNIQUE_VIOLATION && attempt < 5) continue;
      created = fromRow<IncidentRecord>(check(res, 'Incident insert failed'));
    }
    const incidentId = created.id;

    check(await db.from('reports').update(toRow({
      incidentId, transcript, transcriptStatus, extraction, aiSource: source,
    })).eq('id', r.id), 'Report update failed');
    emitChange({ incidentId, reportId: r.id });

    await addLog(incidentId, 'Report received', true);
    await addLog(incidentId, source === 'AI' ? 'Structured by AI' : 'Structured by keyword fallback (AI unavailable)', false);
    if (transcriptStatus === 'FAILED') await addLog(incidentId, 'Voice note could not be transcribed — listen to it', false);

    // 6. Possible duplicate (BR-40…BR-43). Never merged automatically.
    const links = await activeLinks();
    const self = links.find((l) => l.id === incidentId);
    const dup = self ? findDuplicate(self, links) : null;
    if (dup) await updateIncident(incidentId, { possibleDuplicateOf: dup.id });

    // 7–8.
    await recomputeIncident(incidentId);
    check(await db.from('reports').update({ processing_status: 'DONE' }).eq('id', r.id), 'Report update failed');
    emitChange({ incidentId, reportId: r.id }); // the victim's step moves on from "Report received"
    failures.delete(r.id);
  } catch (e) {
    console.error(`Processing report ${reportId} failed:`, e);
    // Best effort: during a database outage this write fails too, and the report simply stays PENDING.
    await db.from('reports').update({ processing_status: 'FAILED' }).eq('id', reportId).neq('processing_status', 'DONE');
    const n = (failures.get(reportId) ?? 0) + 1;
    failures.set(reportId, n);
    if (n <= RETRY_DELAYS_MS.length) setTimeout(() => enqueueReport(reportId), RETRY_DELAYS_MS[n - 1]).unref();
  } finally {
    inFlight.delete(reportId);
    pump();
  }
}
