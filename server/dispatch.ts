// server/dispatch.ts — auto-dispatch (features.md F28, rules.md BR-160…BR-166), plus the assignment steps it shares
// with coordinators, volunteers and SMS answers: create an assignment, apply a volunteer's answer, and the dispatcher
// that sends SOS offers to the best-matched volunteer, expires unanswered ones and moves on to the next volunteer.
// Rules come from shared/dispatch.ts and shared/volunteerMatch.ts; this file only reads, writes and notifies.
import { DISPATCH_TICK_MS } from '../shared/constants';
import {
  DEFAULT_DISPATCH, assignedPush, assignedSms, checkDispatchSettings, expiredOffers, incidentsToDispatch, parseVolunteerReply,
  sosPush, sosSms, sosSummary, waitingIncidents,
} from '../shared/dispatch';
import { distanceBetween, formatDistance } from '../shared/linking';
import { effectivePriority } from '../shared/scoring';
import {
  ACTIVE_STATUSES, ApiError, UNABLE_REASONS,
  type AssignmentRecord, type AssignmentStatus, type DispatchSettings, type DispatchState, type IncidentRecord, type ProfileRecord,
} from '../shared/types';
import { humanize, rankVolunteers } from '../shared/volunteerMatch';
import { emitChange } from './events';
import { fromRow, fromRows } from './mappers';
import { addLog, allAssignments, endAssignment, getIncident, recomputeIncident, releaseVolunteer, updateIncident } from './pipeline';
import { sendPush } from './push';
import { sendSms } from './smsGateway';
import { db } from './supabase';

const nowIso = () => new Date().toISOString();

async function rows<T>(query: PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${error.message}`);
  return fromRows<T>(data);
}
const volunteers = () => rows<ProfileRecord>(db.from('profiles').select('*').eq('role', 'VOLUNTEER'), 'Volunteer lookup failed');

// ---------------------------------------------------------------- settings (BR-160)

const SETTINGS_KEY = 'dispatch';

export async function getDispatchSettings(): Promise<DispatchSettings> {
  const { data, error } = await db.from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  if (error) throw new Error(`Settings lookup failed: ${error.message}`);
  const s = data ? checkDispatchSettings({ ...DEFAULT_DISPATCH, ...(data.value as object) }) : DEFAULT_DISPATCH;
  return typeof s === 'string' ? DEFAULT_DISPATCH : s;
}

export async function saveDispatchSettings(input: unknown): Promise<DispatchSettings> {
  const s = checkDispatchSettings(input);
  if (typeof s === 'string') throw new ApiError('VALIDATION', s);
  const { data, error } = await db.from('settings').update({ value: s, updated_at: nowIso() }).eq('key', SETTINGS_KEY).select('key');
  if (error) throw new Error(`Settings update failed: ${error.message}`);
  if (!data?.length) {
    const { error: e } = await db.from('settings').insert({ key: SETTINGS_KEY, value: s });
    if (e) throw new Error(`Settings insert failed: ${e.message}`);
  }
  return s;
}

/** For the dashboard: the settings, how many incidents wait for a volunteer, and how many SOS offers are open. */
export async function dispatchState(): Promise<DispatchState> {
  const [settings, incidents, assignments] = await Promise.all([
    getDispatchSettings(),
    rows<IncidentRecord>(db.from('incidents').select('*').in('status', ['NEW', 'VERIFIED']), 'Incident lookup failed'),
    allAssignments(),
  ]);
  return {
    settings,
    waiting: waitingIncidents(incidents, assignments).length,
    pendingOffers: assignments.filter((a) => a.auto && a.status === 'ASSIGNED').length,
  };
}

// ---------------------------------------------------------------- assignment steps (BR-100, BR-101…BR-104)

/**
 * Creates an ASSIGNED assignment. `sos` = sent by auto-dispatch: it must be answered within `minutes` (BR-162).
 * The caller has checked the incident's state and the volunteer's eligibility (BR-60).
 */
export async function createAssignment(i: IncidentRecord, v: ProfileRecord, sos: { minutes: number } | null): Promise<AssignmentRecord> {
  const row = { incident_id: i.id, volunteer_id: v.id, status: 'ASSIGNED', ...(sos ? { auto: true, respond_by: new Date(Date.now() + sos.minutes * 60_000).toISOString() } : {}) };
  const res = await db.from('assignments').insert(row).select('*').single();
  if (res.error) throw new Error(`Assignment insert failed: ${res.error.message}`);
  emitChange({ incidentId: i.id, volunteerId: v.id }); // lets that volunteer's stream start following this incident
  return fromRow<AssignmentRecord>(res.data);
}

/** BR-104 volunteer transitions. */
export const TRANSITIONS: Partial<Record<AssignmentStatus, AssignmentStatus[]>> = {
  ASSIGNED: ['ACCEPTED', 'DECLINED'],
  ACCEPTED: ['EN_ROUTE', 'ON_SITE', 'UNABLE'],
  EN_ROUTE: ['ON_SITE', 'UNABLE'],
  ON_SITE: ['ASSISTING', 'DONE', 'UNABLE'],
  ASSISTING: ['DONE', 'UNABLE'],
};

/** A volunteer's step on their own assignment, from the app or an SMS answer, with the BR-101…BR-104 effects and logs. */
export async function applyVolunteerStatus(
  a: AssignmentRecord, volunteer: { id: string; name: string }, status: AssignmentStatus, reason: string | null, via: 'APP' | 'SMS' = 'APP',
): Promise<void> {
  if (!TRANSITIONS[a.status]?.includes(status)) {
    throw new ApiError('INVALID_STATE', 'This step is not possible right now. Refresh to see the latest status.');
  }
  const i = await getIncident(a.incidentId);
  const bySms = via === 'SMS' ? ' (by SMS)' : '';

  if (status === 'DECLINED' || status === 'UNABLE') {
    if (!reason?.trim()) throw new ApiError('VALIDATION', 'Choose a reason.');
    await endAssignment(a, status, reason.trim());
    const label = (UNABLE_REASONS as readonly string[]).includes(reason) ? humanize(reason) : reason;
    await addLog(i.id, `Volunteer ${volunteer.name} ${status === 'DECLINED' ? 'declined' : 'unable'}${bySms}: ${label}`, false);
    void runDispatch(); // auto-dispatch (if on) asks the next volunteer now, not at the next tick
    return;
  }

  // From the status the caller saw only: a deadline that passed a moment ago must win (BR-162).
  const { data, error } = await db.from('assignments').update({ status, updated_at: nowIso() }).eq('id', a.id).eq('status', a.status).select('id');
  if (error) throw new Error(`Assignment update failed: ${error.message}`);
  if (!data?.length) throw new ApiError('INVALID_STATE', 'This request has timed out or changed. Refresh to see the latest status.');

  if (status === 'ACCEPTED') {
    const { error: busyError } = await db.from('profiles').update({ availability: 'BUSY' }).eq('id', volunteer.id);
    if (busyError) throw new Error(`Volunteer update failed: ${busyError.message}`);
    await updateIncident(i.id, i.status === 'NEW' || i.status === 'VERIFIED' ? { status: 'IN_PROGRESS' } : {}); // BR-101
    await addLog(i.id, 'A volunteer has accepted and is preparing to help', true);
    if (via === 'SMS') await addLog(i.id, `Volunteer ${volunteer.name} accepted by SMS`, false);
  } else if (status === 'EN_ROUTE') {
    await updateIncident(i.id, {});
    await addLog(i.id, 'Help is on the way', true);
  } else if (status === 'ON_SITE') {
    await addLog(i.id, 'Help has arrived', true);
    if (!i.onSiteAt) {
      await updateIncident(i.id, { onSiteAt: nowIso() });
      await recomputeIncident(i.id);
    } else {
      await updateIncident(i.id, {});
    }
  } else if (status === 'ASSISTING') {
    await updateIncident(i.id, {});
    await addLog(i.id, 'Volunteer is helping on site', false);
  } else if (status === 'DONE') {
    await releaseVolunteer(volunteer.id);
    await updateIncident(i.id, {});
    await addLog(i.id, 'The volunteer has completed their help', true);
  }
}

// ---------------------------------------------------------------- volunteers' SMS answers (BR-163)

const digits = (p: string | null) => (p ?? '').replace(/\D/g, '');
/** Same phone number, with or without the country code (compares the last 10 digits). */
export const samePhone = (a: string | null, b: string | null) => {
  const x = digits(a);
  const y = digits(b);
  return x.length >= 7 && y.length >= 7 && x.slice(-10) === y.slice(-10);
};

/**
 * An SMS from a volunteer's number that says YES or NO (optionally with the incident code) answers their SOS offer.
 * Null when it isn't one (then it is handled as a report). Returns the reply to text back.
 */
export async function answerBySms(from: string, text: string): Promise<{ reply: string } | null> {
  const answer = parseVolunteerReply(text);
  if (!answer) return null;
  const v = (await volunteers()).find((p) => samePhone(p.phone, from));
  if (!v) return null;
  const offers = await rows<AssignmentRecord>(db.from('assignments').select('*').eq('volunteer_id', v.id).eq('status', 'ASSIGNED'), 'Assignment lookup failed');
  const withCodes = await Promise.all(offers.map(async (a) => ({ a, code: (await getIncident(a.incidentId)).code })));
  const pick = answer.code ? withCodes.find((o) => o.code === answer.code) : withCodes.length === 1 ? withCodes[0] : undefined;
  if (!pick) {
    return {
      reply: withCodes.length
        ? `HopeGrid: you have ${withCodes.length} requests. Reply YES or NO with the code, e.g. YES ${withCodes[0].code}.`
        : 'HopeGrid: no request is waiting for you right now. It may have timed out and gone to someone else.',
    };
  }
  try {
    await applyVolunteerStatus(pick.a, v, answer.answer === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED', answer.answer === 'ACCEPT' ? null : 'Declined by SMS', 'SMS');
  } catch (e) {
    if (e instanceof ApiError && e.code === 'INVALID_STATE') return { reply: `HopeGrid: request #${pick.code} has already timed out and gone to someone else.` };
    throw e;
  }
  return {
    reply: answer.answer === 'ACCEPT'
      ? `HopeGrid: thank you, you accepted #${pick.code}. Open the app for the exact place and to message the reporter.`
      : `HopeGrid: you declined #${pick.code}. We will ask someone else.`,
  };
}

// ---------------------------------------------------------------- the dispatcher (BR-160…BR-162, BR-164)

/** What a request is about, for SMS and push: type, priority, people and flags, place and distance from the volunteer. */
function requestSummary(v: ProfileRecord, i: IncidentRecord) {
  const m = distanceBetween(i, v);
  const source = { ...i, priority: effectivePriority(i.priority, i.priorityOverride) };
  return { source, summary: sosSummary(source, m === null ? null : formatDistance(m), humanize) };
}

/** SMS (if the volunteer has a phone) and push (if their app registered). Best effort: the app shows the request anyway. */
async function tellVolunteer(v: ProfileRecord, a: AssignmentRecord, sms: string, push: { title: string; body: string }): Promise<void> {
  if (v.phone) await sendSms(v.phone, sms);
  if (v.pushToken) {
    const result = await sendPush(v.pushToken, { ...push, data: { assignmentId: a.id, path: '/volunteer' } });
    if (result === 'INVALID_TOKEN') await db.from('profiles').update({ push_token: null }).eq('id', v.id);
  }
}

/** SOS by SMS and push (BR-164). */
async function notifyVolunteer(v: ProfileRecord, i: IncidentRecord, a: AssignmentRecord, minutes: number): Promise<void> {
  const { source, summary } = requestSummary(v, i);
  await tellVolunteer(v, a, sosSms(source, summary, minutes), sosPush(source, summary, minutes));
}

/** BR-167: a coordinator's assignment reaches the volunteer the same ways, without a deadline. */
export async function notifyAssigned(v: ProfileRecord, i: IncidentRecord, a: AssignmentRecord): Promise<void> {
  const { source, summary } = requestSummary(v, i);
  await tellVolunteer(v, a, assignedSms(source, summary), assignedPush(source, summary));
}

/** BR-162: an SOS not answered in time counts as declined; the incident goes back to the queue for the next volunteer. */
async function expireOffer(a: AssignmentRecord): Promise<void> {
  try {
    await endAssignment(a, 'DECLINED', 'No answer in time');
  } catch (e) {
    if (e instanceof ApiError && e.code === 'INVALID_STATE') return; // answered just now
    throw e;
  }
  const [v] = await rows<ProfileRecord>(db.from('profiles').select('*').eq('id', a.volunteerId), 'Volunteer lookup failed');
  await addLog(a.incidentId, `Auto-dispatch: ${v?.name ?? 'the volunteer'} did not answer in time`, false);
}

const noVolunteerLogged = new Set<string>(); // incidents already logged as "no volunteer available" (no repeat per tick)

async function dispatchOnce(): Promise<void> {
  const settings = await getDispatchSettings();
  let assignments = await allAssignments();
  const expired = expiredOffers(assignments, new Date());
  for (const a of expired) await expireOffer(a);
  if (expired.length) assignments = await allAssignments();
  if (settings.mode === 'OFF') return;

  const incidents = await rows<IncidentRecord>(db.from('incidents').select('*').in('status', ACTIVE_STATUSES), 'Incident lookup failed');
  const waiting = waitingIncidents(incidents, assignments);
  const chosen = incidentsToDispatch(settings, waiting);
  if (!chosen.length) return;
  const why = settings.mode === 'ALWAYS' ? 'auto-dispatch is on' : `${waiting.length} incidents waiting, more than ${settings.threshold}`;
  const pool = await volunteers();

  for (const i of chosen) {
    const [best] = rankVolunteers(i, pool, assignments);
    if (!best) {
      if (!noVolunteerLogged.has(i.id)) await addLog(i.id, 'Auto-dispatch: no available volunteer yet', false);
      noVolunteerLogged.add(i.id);
      continue;
    }
    noVolunteerLogged.delete(i.id);
    const v = pool.find((p) => p.id === best.volunteerId)!;
    const a = await createAssignment(i, v, { minutes: settings.responseMinutes });
    assignments = [...assignments, a]; // this volunteer now has an open offer: not chosen again in this pass
    await updateIncident(i.id, i.autoDispatchedAt ? {} : { autoDispatchedAt: nowIso() });
    await addLog(i.id, `Auto-dispatch (${why}): SOS sent to ${v.name}, ${best.score}/100; answer within ${settings.responseMinutes} min`, false);
    void notifyVolunteer(v, i, a, settings.responseMinutes);
  }
}

let running: Promise<void> | null = null;
let again = false;
let lastError = ''; // the same failure every tick (e.g. schema.sql not re-run) is logged once

/** One dispatch pass; a call while one runs makes it run once more. Never throws (errors are logged). */
export function runDispatch(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await dispatchOnce();
      } while (again);
      lastError = '';
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== lastError) console.error('Auto-dispatch failed:', message);
      lastError = message;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Server start: check deadlines and the queue every DISPATCH_TICK_MS. */
export function startDispatcher(): void {
  setInterval(() => void runDispatch(), DISPATCH_TICK_MS).unref();
  void runDispatch();
}
