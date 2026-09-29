// src/data/mockApi.ts — in-browser implementation of the Api interface (features.md F23).
// Uses the REAL shared/ rules for extraction, scores, duplicates, related, matching, public view and tracking.
// State persists in localStorage key "mockdb"; photos/audio live in IndexedDB (mock media store).
// Replaced by realApi.ts in Phase C — nothing outside src/data/ may import this file (AR-12).
import { del, get, keys, set } from 'idb-keyval';
import { DEMO_CENTER, DEMO_OTP, INCIDENT_CODE_LENGTH, MAX_AUDIO_BASE64, MAX_AUDIO_SECONDS, MAX_PHOTO_BASE64, MOCK_LATENCY_MS } from '../../shared/constants';
import { keywordExtractor } from '../../shared/keywordExtractor';
import { distanceBetween, findDuplicate, findRelated, mergeFields, type LinkIncident } from '../../shared/linking';
import { isPublic, toPublicIncident } from '../../shared/publicView';
import { computeConfidence, computeEscalation, computePriority, confidenceBand, effectivePriority, priorityRank } from '../../shared/scoring';
import { victimStep } from '../../shared/trackingStatus';
import {
  ACTIVE_ASSIGNMENT, ACTIVE_STATUSES, ApiError, CHAT_OPEN_ASSIGNMENT, NEEDS,
  type AssignmentStatus, type ChatMessage, type ChatThread, type IncidentDetail, type IncidentListItem, type IncidentPatch,
  type OutgoingMessage, type PriorityLevel, type ReportSubmission, type Resource, type ResourceInput, type Role,
  type SessionUser, type VolunteerAssignment, type VolunteerProfile,
} from '../../shared/types';
import { isEligible, rankVolunteers } from '../../shared/volunteerMatch';
import { newReportCode, newUuid } from '../lib/codes';
import { setPositionOverride } from '../lib/geo';
import { TYPE_LABEL, UNABLE_LABEL } from '../lib/labels';
import { isOnline } from '../offline/useOnline';
import type { Api } from './index';
import { getToken } from './index';
import {
  CANNED_TRANSCRIPT, DEMO_ACCOUNTS, MOCK_DB_VERSION, SECOND_REPORT, buildSeed,
  type AssignmentRow, type IncidentRow, type MockDb, type ProfileRow, type ReportRow,
} from './mockData';

const STORAGE_KEY = 'mockdb';
const MEDIA_PREFIX = 'mockmedia:';
const PROCESSING_DELAY_MS = 1600; // simulated AI/transcription time

// ======================================================================
// Storage
// ======================================================================
// Initialised at the bottom of this file, after all helpers exist.
let db: MockDb;

function load(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb;
      if (parsed.version === MOCK_DB_VERSION) return parsed;
    }
  } catch { /* fall through to seed */ }
  return seed();
}
function save(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch { /* quota — keep in memory */ }
}
function seed(): MockDb {
  db = buildSeed();
  db.incidents.forEach((i) => recompute(i, false));
  save();
  return db;
}

async function putMedia(base64: string, mime: string): Promise<string> {
  const key = newUuid();
  await set(MEDIA_PREFIX + key, `data:${mime};base64,${base64}`);
  return key;
}
async function mediaUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  return (await get<string>(MEDIA_PREFIX + key)) ?? null;
}
async function clearMedia(): Promise<void> {
  const all = await keys();
  await Promise.all(all.filter((k) => String(k).startsWith(MEDIA_PREFIX)).map((k) => del(k)));
}

// ======================================================================
// Call wrapper: latency, offline, failure injection, pending processing
// ======================================================================
let failNext = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(fn: () => T | Promise<T>): Promise<T> {
  await sleep(MOCK_LATENCY_MS);
  if (!isOnline()) throw new ApiError('NETWORK', "You're offline. Check your connection and try again.");
  if (failNext) {
    failNext = false;
    throw new ApiError('SERVER_ERROR', 'The server could not complete this action. Try again.');
  }
  db = load(); // pick up changes made in other tabs
  processPending();
  const result = await fn();
  save();
  return result;
}

// ======================================================================
// Helpers
// ======================================================================
const nowIso = () => new Date().toISOString();

function incident(id: string): IncidentRow {
  const i = db.incidents.find((x) => x.id === id);
  if (!i) throw new ApiError('NOT_FOUND', 'This incident does not exist.');
  return i;
}
const reportsOf = (incidentId: string) =>
  db.reports.filter((r) => r.incidentId === incidentId).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
const assignmentsOf = (incidentId: string) =>
  db.assignments.filter((a) => a.incidentId === incidentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const activeAssignment = (incidentId: string) => assignmentsOf(incidentId).find((a) => ACTIVE_ASSIGNMENT.includes(a.status)) ?? null;
const eff = (i: IncidentRow) => effectivePriority(i.priority, i.priorityOverride);
const profile = (id: string) => db.profiles.find((p) => p.id === id);

function addLog(incidentId: string, text: string, pub: boolean): void {
  db.logs.push({ id: newUuid(), incidentId, text, public: pub, createdAt: nowIso() });
}
function touch(i: IncidentRow): void {
  i.updatedAt = nowIso();
}
function uniqueIncidentCode(): string {
  let code = newReportCode(INCIDENT_CODE_LENGTH);
  while (db.incidents.some((i) => i.code === code)) code = newReportCode(INCIDENT_CODE_LENGTH);
  return code;
}
function requireActive(i: IncidentRow, action: string): void {
  if (!ACTIVE_STATUSES.includes(i.status)) throw new ApiError('INVALID_STATE', `This incident is ${i.status.toLowerCase().replace('_', ' ')}, so it cannot be ${action}.`);
}

/** Recompute confidence, priority and escalation for an incident (architecture §11.2 recomputeIncident). */
function recompute(i: IncidentRow, bump = true): void {
  const reps = reportsOf(i.id);
  const c = computeConfidence(
    { verifiedAt: i.verifiedAt, onSiteAt: i.onSiteAt },
    reps.map((r) => ({ deviceId: r.deviceId, hasPhoto: !!r.photoKey, receivedAt: r.receivedAt, phoneVerified: r.phoneVerified })),
  );
  i.confidence = c.score;
  i.confidenceReasons = c.reasons;
  const p = computePriority(i);
  i.priorityScore = p.score;
  i.priority = p.level;
  i.priorityReasons = p.reasons;
  const e = computeEscalation({ ...i, effectivePriority: eff(i) });
  i.escalationRecommended = e.recommended;
  i.escalationReasons = e.reasons;
  if (bump) touch(i);
}

function toLink(i: IncidentRow): LinkIncident {
  const reps = reportsOf(i.id);
  return {
    id: i.id, code: i.code, type: i.type, status: i.status, lat: i.lat, lng: i.lng, createdAt: i.createdAt,
    places: [...new Set(reps.flatMap((r) => r.extraction?.places ?? []))],
    text: [i.summary ?? '', ...reps.map((r) => `${r.text} ${r.transcript ?? ''}`)].join(' '),
    possibleDuplicateOf: i.possibleDuplicateOf,
  };
}

// ======================================================================
// Pipeline (mock of server/pipeline.ts)
// ======================================================================
function processPending(): void {
  const cutoff = Date.now() - PROCESSING_DELAY_MS;
  db.reports.filter((r) => r.processingStatus === 'PENDING' && new Date(r.receivedAt).getTime() <= cutoff).forEach(processReport);
}

function processReport(r: ReportRow): void {
  if (r.audioKey) {
    r.transcript = CANNED_TRANSCRIPT;
    r.transcriptStatus = 'DONE';
  }
  const description = [r.text, r.transcript].filter(Boolean).join('\n');
  const x = keywordExtractor(description);
  if (r.people !== null) x.people = r.people; // BR-13
  x.needs = [...new Set([...x.needs, ...r.needs])];
  r.extraction = x;
  r.aiSource = 'KEYWORDS';

  const at = r.receivedAt;
  const inc: IncidentRow = {
    id: newUuid(), code: uniqueIncidentCode(), type: x.type, lat: r.lat, lng: r.lng,
    locationText: r.locationText ?? x.places[0] ?? null, publicArea: null, people: x.people,
    vulnerable: x.vulnerable || x.mobilityIssue, trapped: x.trapped, medical: x.medical, danger: x.danger, needs: x.needs,
    summary: x.summary || null, status: 'NEW', confidence: 0, confidenceReasons: [], priorityScore: 0, priority: 'LOW',
    priorityReasons: [], priorityOverride: null, overrideReason: null, escalationRecommended: false, escalationReasons: [],
    escalatedAt: null, verifiedAt: null, onSiteAt: null, resolvedAt: null, rejectReason: null, possibleDuplicateOf: null,
    mergedInto: null, createdAt: at, updatedAt: at,
  };
  db.incidents.push(inc);
  r.incidentId = inc.id;
  r.processingStatus = 'DONE';
  addLog(inc.id, 'Report received', true);
  addLog(inc.id, 'Structured by keyword fallback (AI unavailable)', false);

  const dup = findDuplicate(toLink(inc), db.incidents.map(toLink));
  if (dup) inc.possibleDuplicateOf = dup.id;
  recompute(inc);
}

// ======================================================================
// Mapping to API types
// ======================================================================
function listItem(i: IncidentRow): IncidentListItem {
  const reps = reportsOf(i.id);
  const asg = assignmentsOf(i.id);
  const active = asg.find((a) => ACTIVE_ASSIGNMENT.includes(a.status));
  const latest = asg[asg.length - 1];
  const dup = i.possibleDuplicateOf ? db.incidents.find((x) => x.id === i.possibleDuplicateOf) : null;
  return {
    id: i.id, code: i.code, type: i.type, status: i.status, priority: eff(i), overridden: i.priorityOverride !== null,
    confidence: i.confidence, confidenceBand: confidenceBand(i.confidence), people: i.people, locationText: i.locationText,
    reportCount: reps.length, hasVoice: reps.some((r) => !!r.audioKey), possibleDuplicateCode: dup?.code ?? null,
    needsReassign: (i.status === 'NEW' || i.status === 'VERIFIED') && !active && asg.some((a) => a.status === 'DECLINED' || a.status === 'UNABLE'),
    readyToResolve: i.status === 'IN_PROGRESS' && latest?.status === 'DONE',
    escalationRecommended: i.escalationRecommended, escalated: i.escalatedAt !== null, createdAt: i.createdAt, updatedAt: i.updatedAt,
  };
}

async function toChatMessage(m: MockDbMessage): Promise<ChatMessage> {
  return { id: m.id, sender: m.sender, text: m.text, audioUrl: await mediaUrl(m.audioKey), lat: m.lat, lng: m.lng, createdAt: m.createdAt };
}
type MockDbMessage = MockDb['messages'][number];

async function detail(i: IncidentRow): Promise<IncidentDetail> {
  const reps = reportsOf(i.id);
  const asg = assignmentsOf(i.id);
  const dup = i.possibleDuplicateOf ? db.incidents.find((x) => x.id === i.possibleDuplicateOf) ?? null : null;
  const canSuggest = (i.status === 'NEW' || i.status === 'VERIFIED') && !activeAssignment(i.id);
  const volunteers = db.profiles.filter((p) => p.role === 'VOLUNTEER');

  const reports = await Promise.all(reps.map(async (r, n) => ({
    id: r.id, label: `Report ${n + 1}`, text: r.text, transcript: r.transcript, transcriptStatus: r.transcriptStatus,
    photoUrl: await mediaUrl(r.photoKey), audioUrl: await mediaUrl(r.audioKey), audioSeconds: r.audioSeconds,
    people: r.people, needs: r.needs, phone: r.phone, phoneVerified: r.phoneVerified, extraction: r.extraction,
    aiSource: r.aiSource, processingStatus: r.processingStatus, lat: r.lat, lng: r.lng, locationText: r.locationText,
    createdAt: r.createdAt, receivedAt: r.receivedAt,
  })));

  const chats: ChatThread[] = await Promise.all(reps.map(async (r, n) => ({
    reportId: r.id,
    label: `Reporter ${n + 1}`,
    messages: await Promise.all(db.messages.filter((m) => m.reportId === r.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(toChatMessage)),
  })));

  return {
    ...listItem(i),
    lat: i.lat, lng: i.lng, publicArea: i.publicArea, vulnerable: i.vulnerable, trapped: i.trapped, medical: i.medical,
    danger: i.danger, needs: i.needs, summary: i.summary, confidenceReasons: i.confidenceReasons, priorityScore: i.priorityScore,
    computedPriority: i.priority, priorityReasons: i.priorityReasons, overrideReason: i.overrideReason,
    escalationReasons: i.escalationReasons, escalatedAt: i.escalatedAt, verifiedAt: i.verifiedAt, resolvedAt: i.resolvedAt,
    rejectReason: i.rejectReason,
    reports,
    possibleDuplicate: dup ? { id: dup.id, code: dup.code, type: dup.type, summary: dup.summary, distanceM: distanceBetween(i, dup) } : null,
    related: findRelated(toLink(i), db.incidents.filter((x) => x.status !== 'MERGED').map(toLink), (t) => TYPE_LABEL[t])
      .map(({ id, code, type, text }) => ({ id, code, type, text })),
    suggestions: canSuggest ? rankVolunteers(i, volunteers, db.assignments) : [],
    assignments: asg.map((a) => ({ id: a.id, volunteerId: a.volunteerId, volunteerName: profile(a.volunteerId)?.name ?? 'Volunteer', status: a.status, reason: a.reason, updatedAt: a.updatedAt })),
    allocations: db.allocations.filter((a) => a.incidentId === i.id).map((a) => {
      const res = db.resources.find((r) => r.id === a.resourceId);
      return { id: a.id, resourceName: res?.name ?? 'Resource', quantity: a.quantity, unit: res?.unit ?? '', createdAt: a.createdAt };
    }),
    logs: db.logs.filter((l) => l.incidentId === i.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => ({ at: l.createdAt, text: l.text, public: l.public })),
    chats,
  };
}

function toVolunteerAssignment(a: AssignmentRow): VolunteerAssignment {
  const i = incident(a.incidentId);
  return {
    id: a.id, status: a.status, reason: a.reason, updatedAt: a.updatedAt,
    incident: {
      id: i.id, code: i.code, type: i.type, summary: i.summary, people: i.people, vulnerable: i.vulnerable, trapped: i.trapped,
      medical: i.medical, danger: i.danger, needs: i.needs, lat: i.lat, lng: i.lng, locationText: i.locationText, priority: eff(i),
    },
    reporters: reportsOf(i.id).map((r, n) => ({ reportId: r.id, label: `Reporter ${n + 1}` })),
  };
}

const toProfile = (p: ProfileRow): VolunteerProfile => ({
  id: p.id, name: p.name, skills: p.skills, equipment: p.equipment, vehicle: p.vehicle, availability: p.availability, lat: p.lat, lng: p.lng,
});

// ======================================================================
// Auth
// ======================================================================
function currentUser(role?: Role): ProfileRow {
  const token = getToken();
  const p = token ? profile(token) : undefined;
  if (!p) throw new ApiError('UNAUTHORIZED', 'Your session has ended. Log in again.');
  if (role && p.role !== role) throw new ApiError('FORBIDDEN', 'You do not have access to this.');
  return p;
}

// ======================================================================
// Victim helpers
// ======================================================================
function victimReport(code: string, pin: string): ReportRow {
  const r = db.reports.find((x) => x.code === code.trim().toUpperCase() && x.pin === pin.trim());
  if (!r) throw new ApiError('UNAUTHORIZED', 'Code or PIN not found. Check and try again.');
  return r;
}
/** Reports are moved on merge, so incidentId always points at the live incident. */
const victimIncident = (r: ReportRow) => (r.incidentId ? db.incidents.find((i) => i.id === r.incidentId) ?? null : null);
const chatAssignment = (incidentId: string) => assignmentsOf(incidentId).find((a) => CHAT_OPEN_ASSIGNMENT.includes(a.status)) ?? null;

function validateSubmission(s: ReportSubmission): void {
  const fail = (m: string) => { throw new ApiError('VALIDATION', m); };
  if (!(s.text.trim().length >= 5 || s.audioBase64 || s.needs.length >= 1)) fail('Describe what happened, record a voice note, or choose what help you need.');
  if (!((s.lat !== null && s.lng !== null) || (s.locationText && s.locationText.trim()) || s.audioBase64)) fail('Add your location or describe where you are.');
  if (s.people !== null && (!Number.isInteger(s.people) || s.people < 0 || s.people > 500)) fail('Number of people must be between 0 and 500.');
  if (s.phone && !/^\+?[\d ]{7,17}$/.test(s.phone.trim())) fail('Phone number should be 7–15 digits.');
  if (s.needs.some((n) => !NEEDS.includes(n))) fail('Unknown type of help selected.');
  if (s.photoBase64 && s.photoBase64.length > MAX_PHOTO_BASE64) fail('The photo is too large.');
  if (s.audioBase64 && (s.audioBase64.length > MAX_AUDIO_BASE64 || (s.audioSeconds ?? 0) > MAX_AUDIO_SECONDS)) fail('The voice note is too long.');
  if (!/^\d{4}$/.test(s.pin)) fail('PIN must be 4 digits.');
}

// ======================================================================
// Assignment state machine (rules.md BR-101…BR-104)
// ======================================================================
const VOLUNTEER_TRANSITIONS: Partial<Record<AssignmentStatus, AssignmentStatus[]>> = {
  ASSIGNED: ['ACCEPTED', 'DECLINED'],
  ACCEPTED: ['EN_ROUTE', 'ON_SITE', 'UNABLE'],
  EN_ROUTE: ['ON_SITE', 'UNABLE'],
  ON_SITE: ['ASSISTING', 'DONE', 'UNABLE'],
  ASSISTING: ['DONE', 'UNABLE'],
};

function setVolunteerAvailable(volunteerId: string): void {
  const v = profile(volunteerId);
  if (v && v.availability === 'BUSY') v.availability = 'AVAILABLE';
}

/** Ends an active assignment as DECLINED / UNABLE / CANCELLED and applies BR-102 + BR-104 side effects. */
function endAssignment(a: AssignmentRow, status: 'DECLINED' | 'UNABLE' | 'CANCELLED', reason: string | null): void {
  a.status = status;
  a.reason = reason;
  a.updatedAt = nowIso();
  setVolunteerAvailable(a.volunteerId);
  const i = incident(a.incidentId);
  if (i.status === 'IN_PROGRESS') i.status = i.verifiedAt ? 'VERIFIED' : 'NEW';
  touch(i);
}

// ======================================================================
// The Api implementation
// ======================================================================
export const mockApi: Api = {
  // ---------------- Victim ----------------
  async submitReport(s) {
    return call(async () => {
      validateSubmission(s);
      const existing = db.reports.find((r) => r.id === s.id);
      if (existing) return { ok: true as const, code: existing.code };
      if (db.reports.some((r) => r.code === s.code)) throw new ApiError('CODE_TAKEN', 'This code is already in use.');
      const photoMime = s.photoBase64?.startsWith('PHN2Zy') ? 'image/svg+xml' : 'image/jpeg'; // demo photo is SVG
      const photoKey = s.photoBase64 ? await putMedia(s.photoBase64, photoMime) : null;
      const audioKey = s.audioBase64 ? await putMedia(s.audioBase64, s.audioMime ?? 'audio/webm') : null;
      db = load(); // re-read in case another tab wrote while media was stored
      db.reports.push({
        id: s.id, code: s.code, pin: s.pin, deviceId: s.deviceId, incidentId: null, text: s.text, transcript: null,
        transcriptStatus: 'NONE', lat: s.lat, lng: s.lng, locationText: s.locationText, people: s.people,
        needs: s.needs, phone: s.phone, phoneVerified: false, photoKey, audioKey, audioSeconds: s.audioSeconds,
        extraction: null, aiSource: null, processingStatus: 'PENDING', createdAt: s.createdAt, receivedAt: nowIso(),
      });
      // Simulate the server finishing processing a moment later, even if nobody calls the API.
      setTimeout(() => { db = load(); processPending(); save(); }, PROCESSING_DELAY_MS + 50);
      return { ok: true as const, code: s.code };
    });
  },

  track(code, pin) {
    return call(() => {
      const r = victimReport(code, pin);
      const i = victimIncident(r);
      const step = victimStep({
        processingStatus: r.processingStatus,
        incident: i ? { status: i.status, verifiedAt: i.verifiedAt } : null,
        assignments: i ? assignmentsOf(i.id) : [],
      });
      const messages = i
        ? db.logs.filter((l) => l.incidentId === i.id && l.public).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => ({ at: l.createdAt, text: l.text }))
        : [];
      return {
        code: r.code, step, updatedAt: i?.updatedAt ?? r.receivedAt, messages, phoneVerified: r.phoneVerified,
        chatOpen: i ? chatAssignment(i.id) !== null : false,
      };
    });
  },

  verifyPhone(code, pin, phone, otp) {
    return call(() => {
      const r = victimReport(code, pin);
      if (!/^\+?[\d ]{7,17}$/.test(phone.trim())) throw new ApiError('VALIDATION', 'Phone number should be 7–15 digits.');
      if (otp.trim() !== DEMO_OTP) throw new ApiError('VALIDATION', 'That code is not correct. Check it and try again.');
      r.phone = phone.trim();
      r.phoneVerified = true;
      const i = victimIncident(r);
      if (i) {
        addLog(i.id, 'Reporter phone verified', false);
        recompute(i);
      }
      return { ok: true as const };
    });
  },

  getVictimChat(code, pin) {
    return call(async () => {
      const r = victimReport(code, pin);
      const i = victimIncident(r);
      const msgs = db.messages.filter((m) => m.reportId === r.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { open: i ? chatAssignment(i.id) !== null : false, messages: await Promise.all(msgs.map(toChatMessage)) };
    });
  },

  sendVictimMessage(code, pin, msg) {
    return call(async () => {
      const r = victimReport(code, pin);
      const i = victimIncident(r);
      const a = i ? chatAssignment(i.id) : null;
      if (!i || !a) throw new ApiError('CHAT_CLOSED', 'Chat is closed. It opens when a volunteer accepts your request.');
      if (!msg.text?.trim() && !msg.audioBase64 && msg.lat === undefined) throw new ApiError('VALIDATION', 'Type a message first.');
      const audioKey = msg.audioBase64 ? await putMedia(msg.audioBase64, msg.audioMime ?? 'audio/webm') : null;
      const row = {
        id: newUuid(), incidentId: i.id, reportId: r.id, assignmentId: a.id, sender: 'VICTIM' as const,
        text: msg.lat !== undefined ? '📍 Shared location' : msg.text?.trim() || null, audioKey,
        lat: msg.lat ?? null, lng: msg.lng ?? null, createdAt: nowIso(),
      };
      db.messages.push(row);
      return toChatMessage(row);
    });
  },

  // ---------------- Public ----------------
  getPublicIncidents() {
    return call(() => {
      const now = new Date();
      const incidents = db.incidents
        .map((i) => ({ ...i, effectivePriority: eff(i), reportCount: reportsOf(i.id).length }))
        .filter((i) => isPublic(i, now))
        .map(toPublicIncident);
      return { generatedAt: now.toISOString(), incidents };
    });
  },

  // ---------------- Auth ----------------
  login(email, password) {
    return call(() => {
      const p = db.profiles.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!p || !password) throw new ApiError('UNAUTHORIZED', 'Email or password is incorrect.');
      return { token: p.id, user: { id: p.id, name: p.name, role: p.role } };
    });
  },
  me() {
    return call(() => {
      const p = currentUser();
      return { user: { id: p.id, name: p.name, role: p.role } as SessionUser };
    });
  },

  // ---------------- Admin ----------------
  listIncidents() {
    return call(() => {
      currentUser('ADMIN');
      const items = db.incidents.filter((i) => i.status !== 'MERGED').map(listItem);
      const counts: Record<PriorityLevel, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      items.filter((i) => ACTIVE_STATUSES.includes(i.status)).forEach((i) => counts[i.priority]++);
      // BR-120 ordering
      items.sort((a, b) =>
        priorityRank(b.priority) - priorityRank(a.priority) ||
        Number(b.escalationRecommended && !b.escalated) - Number(a.escalationRecommended && !a.escalated) ||
        a.createdAt.localeCompare(b.createdAt));
      return { counts, incidents: items };
    });
  },

  getIncident(id) {
    return call(() => {
      currentUser('ADMIN');
      return detail(incident(id));
    });
  },

  editIncident(id, patch: IncidentPatch) {
    return call(() => {
      currentUser('ADMIN');
      const i = incident(id);
      requireActive(i, 'edited');
      if (patch.people !== undefined && patch.people !== null && (patch.people < 0 || patch.people > 500)) {
        throw new ApiError('VALIDATION', 'Number of people must be between 0 and 500.');
      }
      Object.assign(i, patch);
      addLog(i.id, 'Details edited by coordinator', false);
      recompute(i);
      return detail(i);
    });
  },

  verifyIncident(id, publicArea) {
    return call(() => {
      currentUser('ADMIN');
      const i = incident(id);
      if (!ACTIVE_STATUSES.includes(i.status) || i.verifiedAt) throw new ApiError('INVALID_STATE', 'This incident is already verified or closed.');
      i.verifiedAt = nowIso();
      if (publicArea?.trim()) i.publicArea = publicArea.trim();
      if (i.status === 'NEW') i.status = 'VERIFIED';
      addLog(i.id, 'Verified by the coordination team', true);
      recompute(i);
      return detail(i);
    });
  },

  rejectIncident(id, reason) {
    return call(() => {
      currentUser('ADMIN');
      const i = incident(id);
      requireActive(i, 'rejected');
      if (!reason.trim()) throw new ApiError('VALIDATION', 'Add a reason for rejecting this report.');
      const a = activeAssignment(i.id);
      if (a) { endAssignment(a, 'CANCELLED', null); addLog(i.id, 'Assignment cancelled', false); }
      i.status = 'REJECTED';
      i.rejectReason = reason.trim();
      addLog(i.id, `Rejected: ${reason.trim()}`, false);
      touch(i);
      return detail(i);
    });
  },

  overridePriority(id, level, reason) {
    return call(() => {
      currentUser('ADMIN');
      const i = incident(id);
      requireActive(i, 'changed');
      if (level && !reason?.trim()) throw new ApiError('VALIDATION', 'Add a reason for changing the priority.');
      i.priorityOverride = level;
      i.overrideReason = level ? reason!.trim() : null;
      addLog(i.id, level ? `Priority set to ${level}: ${reason!.trim()}` : 'Priority override removed', false);
      recompute(i);
      return detail(i);
    });
  },

  escalateIncident(id, note) {
    return call(() => {
      currentUser('ADMIN');
      const i = incident(id);
      requireActive(i, 'escalated');
      if (i.escalatedAt) throw new ApiError('INVALID_STATE', 'This incident has already been escalated.');
      i.escalatedAt = nowIso();
      addLog(i.id, 'Escalated to emergency services (simulated)', true);
      if (note?.trim()) addLog(i.id, `Escalation note: ${note.trim()}`, false);
      touch(i);
      return detail(i);
    });
  },

  resolveIncident(id, note) {
    return call(() => {
      currentUser('ADMIN');
      const i = incident(id);
      requireActive(i, 'resolved');
      const a = activeAssignment(i.id);
      if (a) { endAssignment(a, 'CANCELLED', null); addLog(i.id, 'Assignment cancelled', false); }
      i.status = 'RESOLVED';
      i.resolvedAt = nowIso();
      addLog(i.id, 'This incident has been resolved', true);
      if (note?.trim()) addLog(i.id, `Resolution note: ${note.trim()}`, false);
      touch(i);
      return detail(i);
    });
  },

  mergeIncident(id, intoId) {
    return call(() => {
      currentUser('ADMIN');
      const s = incident(id);
      const t = incident(intoId);
      if (s.id === t.id || !ACTIVE_STATUSES.includes(s.status) || !ACTIVE_STATUSES.includes(t.status)) {
        throw new ApiError('INVALID_STATE', 'Both incidents must be open to merge them.');
      }
      if (activeAssignment(s.id) && activeAssignment(t.id)) {
        throw new ApiError('INVALID_STATE', 'Cancel one of the active assignments first.');
      }
      // BR-50 — move everything, then combine fields.
      db.reports.filter((r) => r.incidentId === s.id).forEach((r) => (r.incidentId = t.id));
      db.assignments.filter((a) => a.incidentId === s.id).forEach((a) => (a.incidentId = t.id));
      db.allocations.filter((a) => a.incidentId === s.id).forEach((a) => (a.incidentId = t.id));
      db.messages.filter((m) => m.incidentId === s.id).forEach((m) => (m.incidentId = t.id));
      Object.assign(t, mergeFields(t, s));
      s.status = 'MERGED';
      s.mergedInto = t.id;
      s.possibleDuplicateOf = null;
      db.incidents.filter((x) => x.possibleDuplicateOf === s.id).forEach((x) => (x.possibleDuplicateOf = x.id === t.id ? null : t.id));
      if (t.possibleDuplicateOf === s.id) t.possibleDuplicateOf = null;
      addLog(t.id, `Merged #${s.code} into this incident`, false);
      addLog(t.id, 'Another report about the same situation was added', true);
      addLog(s.id, `Merged into #${t.code}`, false);
      touch(s);
      recompute(t);
      return detail(t);
    });
  },

  dismissDuplicate(id) {
    return call(() => {
      currentUser('ADMIN');
      const i = incident(id);
      i.possibleDuplicateOf = null;
      addLog(i.id, 'Marked as not a duplicate', false);
      touch(i);
      return detail(i);
    });
  },

  assignVolunteer(id, volunteerId) {
    return call(() => {
      currentUser('ADMIN');
      const i = incident(id);
      if (i.status !== 'NEW' && i.status !== 'VERIFIED') throw new ApiError('INVALID_STATE', 'Volunteers can only be assigned to new or verified incidents.');
      if (activeAssignment(i.id)) throw new ApiError('INVALID_STATE', 'This incident already has a volunteer. Cancel that assignment first.');
      const v = profile(volunteerId);
      if (!v || v.role !== 'VOLUNTEER') throw new ApiError('NOT_FOUND', 'This volunteer does not exist.');
      if (!isEligible(v, i.id, db.assignments)) throw new ApiError('INVALID_STATE', `${v.name} is not available for this incident.`);
      const now = nowIso();
      db.assignments.push({ id: newUuid(), incidentId: i.id, volunteerId: v.id, status: 'ASSIGNED', reason: null, createdAt: now, updatedAt: now });
      addLog(i.id, `Volunteer ${v.name} assigned`, false);
      touch(i);
      return detail(i);
    });
  },

  cancelAssignment(assignmentId) {
    return call(() => {
      currentUser('ADMIN');
      const a = db.assignments.find((x) => x.id === assignmentId);
      if (!a) throw new ApiError('NOT_FOUND', 'This assignment does not exist.');
      if (!ACTIVE_ASSIGNMENT.includes(a.status)) throw new ApiError('INVALID_STATE', 'This assignment has already ended.');
      endAssignment(a, 'CANCELLED', null);
      addLog(a.incidentId, 'Assignment cancelled', false);
      return detail(incident(a.incidentId));
    });
  },

  allocateResource(id, resourceId, quantity) {
    return call(() => {
      currentUser('ADMIN');
      const i = incident(id);
      requireActive(i, 'given resources');
      const r = db.resources.find((x) => x.id === resourceId);
      if (!r) throw new ApiError('NOT_FOUND', 'This resource does not exist.');
      if (!Number.isInteger(quantity) || quantity < 1) throw new ApiError('VALIDATION', 'Quantity must be a whole number of at least 1.');
      if (quantity > r.quantity) throw new ApiError('INSUFFICIENT_QUANTITY', `Only ${r.quantity} ${r.unit} available.`);
      r.quantity -= quantity;
      db.allocations.push({ id: newUuid(), resourceId: r.id, incidentId: i.id, quantity, createdAt: nowIso() });
      addLog(i.id, 'Relief supplies allocated', true);
      addLog(i.id, `Allocated ${quantity} ${r.unit} ${r.name.toLowerCase()}`, false);
      touch(i);
      return detail(i);
    });
  },

  listResources() {
    return call(() => {
      currentUser('ADMIN');
      return db.resources.map((r) => ({ ...r })) as Resource[];
    });
  },

  createResource(input: ResourceInput) {
    return call(() => {
      currentUser('ADMIN');
      if (!input.name.trim()) throw new ApiError('VALIDATION', 'Give the resource a name.');
      if (!Number.isInteger(input.quantity) || input.quantity < 0) throw new ApiError('VALIDATION', 'Quantity must be 0 or more.');
      const row = { ...input, name: input.name.trim(), id: newUuid() };
      db.resources.push(row);
      return { ...row };
    });
  },

  updateResource(id, patch) {
    return call(() => {
      currentUser('ADMIN');
      const r = db.resources.find((x) => x.id === id);
      if (!r) throw new ApiError('NOT_FOUND', 'This resource does not exist.');
      if (patch.quantity !== undefined && (!Number.isInteger(patch.quantity) || patch.quantity < 0)) {
        throw new ApiError('VALIDATION', 'Quantity must be 0 or more.');
      }
      Object.assign(r, patch);
      return { ...r };
    });
  },

  // ---------------- Volunteer ----------------
  getMyProfile() {
    return call(() => toProfile(currentUser('VOLUNTEER')));
  },

  updateMyProfile(patch) {
    return call(() => {
      const p = currentUser('VOLUNTEER');
      if (patch.availability) {
        if (patch.availability === 'BUSY') throw new ApiError('VALIDATION', 'Busy is set automatically when you accept an assignment.');
        const engaged = db.assignments.some((a) => a.volunteerId === p.id && CHAT_OPEN_ASSIGNMENT.includes(a.status));
        if (engaged) throw new ApiError('INVALID_STATE', 'Finish your current assignment before changing availability.');
      }
      Object.assign(p, patch);
      return toProfile(p);
    });
  },

  listMyAssignments() {
    return call(() => {
      const p = currentUser('VOLUNTEER');
      const mine = db.assignments.filter((a) => a.volunteerId === p.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const active = mine.filter((a) => ACTIVE_ASSIGNMENT.includes(a.status));
      const finished = mine.filter((a) => !ACTIVE_ASSIGNMENT.includes(a.status)).slice(0, 5);
      return [...active, ...finished].map(toVolunteerAssignment);
    });
  },

  updateAssignmentStatus(id, status, reason) {
    return call(() => {
      const p = currentUser('VOLUNTEER');
      const a = db.assignments.find((x) => x.id === id);
      if (!a) throw new ApiError('NOT_FOUND', 'This assignment does not exist.');
      if (a.volunteerId !== p.id) throw new ApiError('FORBIDDEN', 'This is not your assignment.');
      if (!VOLUNTEER_TRANSITIONS[a.status]?.includes(status)) {
        throw new ApiError('INVALID_STATE', 'This step is not possible right now. Refresh to see the latest status.');
      }
      if ((status === 'DECLINED' || status === 'UNABLE') && !reason) throw new ApiError('VALIDATION', 'Choose a reason.');
      const i = incident(a.incidentId);
      const reasonText = reason ? (UNABLE_LABEL as Record<string, string>)[reason] ?? reason : null;

      if (status === 'DECLINED' || status === 'UNABLE') {
        endAssignment(a, status, reason ?? null);
        addLog(i.id, `Volunteer ${p.name} ${status === 'DECLINED' ? 'declined' : 'unable'}: ${reasonText}`, false);
        return toVolunteerAssignment(a);
      }

      a.status = status;
      a.updatedAt = nowIso();
      if (status === 'ACCEPTED') {
        p.availability = 'BUSY';
        if (i.status === 'NEW' || i.status === 'VERIFIED') i.status = 'IN_PROGRESS';
        addLog(i.id, 'A volunteer has accepted and is preparing to help', true);
      } else if (status === 'EN_ROUTE') {
        addLog(i.id, 'Help is on the way', true);
      } else if (status === 'ON_SITE') {
        addLog(i.id, 'Help has arrived', true);
        if (!i.onSiteAt) { i.onSiteAt = nowIso(); recompute(i); }
      } else if (status === 'ASSISTING') {
        addLog(i.id, 'Volunteer is helping on site', false);
      } else if (status === 'DONE') {
        setVolunteerAvailable(p.id);
        addLog(i.id, 'The volunteer has completed their help', true);
      }
      touch(i);
      return toVolunteerAssignment(a);
    });
  },

  getAssignmentChat(id) {
    return call(async () => {
      const p = currentUser('VOLUNTEER');
      const a = db.assignments.find((x) => x.id === id);
      if (!a || a.volunteerId !== p.id) throw new ApiError('FORBIDDEN', 'This is not your assignment.');
      const threads = await Promise.all(reportsOf(a.incidentId).map(async (r, n) => ({
        reportId: r.id,
        label: `Reporter ${n + 1}`,
        messages: await Promise.all(db.messages.filter((m) => m.reportId === r.id && m.assignmentId === a.id).sort((x, y) => x.createdAt.localeCompare(y.createdAt)).map(toChatMessage)),
      })));
      return { open: CHAT_OPEN_ASSIGNMENT.includes(a.status), threads };
    });
  },

  sendVolunteerMessage(id, reportId, msg: OutgoingMessage) {
    return call(async () => {
      const p = currentUser('VOLUNTEER');
      const a = db.assignments.find((x) => x.id === id);
      if (!a || a.volunteerId !== p.id) throw new ApiError('FORBIDDEN', 'This is not your assignment.');
      if (!CHAT_OPEN_ASSIGNMENT.includes(a.status)) throw new ApiError('CHAT_CLOSED', 'Chat is closed for this assignment.');
      const r = db.reports.find((x) => x.id === reportId);
      if (!r || r.incidentId !== a.incidentId) throw new ApiError('FORBIDDEN', 'This reporter is not part of your assignment.');
      if (!msg.text?.trim() && !msg.audioBase64) throw new ApiError('VALIDATION', 'Type a message first.');
      const audioKey = msg.audioBase64 ? await putMedia(msg.audioBase64, msg.audioMime ?? 'audio/webm') : null;
      const row = {
        id: newUuid(), incidentId: a.incidentId, reportId, assignmentId: a.id, sender: 'VOLUNTEER' as const,
        text: msg.text?.trim() || null, audioKey, lat: null, lng: null, createdAt: nowIso(),
      };
      db.messages.push(row);
      return toChatMessage(row);
    });
  },

  // ---------------- Dev ----------------
  resetDemo() {
    return call(async () => {
      await clearMedia();
      seed();
      return { ok: true as const };
    });
  },
};

// ======================================================================
// Demo-only tools (floating Demo menu). Not part of the Api contract.
// ======================================================================
db = load();

const DEMO_POSITION = { ...DEMO_CENTER, accuracy: 15 };
const REAL_LOCATION_KEY = 'useRealLocation';
const useReal = () => { try { return sessionStorage.getItem(REAL_LOCATION_KEY) === '1'; } catch { return false; } };
setPositionOverride(useReal() ? null : DEMO_POSITION);

/** Simple placeholder "photo" for the injected second report. */
const DEMO_PHOTO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#6b7b86"/><rect y="250" width="640" height="170" fill="#4d6a78"/><rect x="70" y="120" width="220" height="170" fill="#c9c2b4"/><rect x="110" y="170" width="50" height="50" fill="#3d3d3d"/><rect x="340" y="90" width="200" height="200" fill="#b8b0a2"/><rect x="380" y="140" width="50" height="50" fill="#3d3d3d"/><path d="M0 262 Q160 240 320 262 T640 262 V420 H0Z" fill="#5f7f8c" opacity=".85"/><text x="20" y="400" font-family="sans-serif" font-size="18" fill="#fff">Demo photo: flooded street</text></svg>';

export const mockDevTools = {
  accounts: DEMO_ACCOUNTS,
  async reset(): Promise<void> {
    await mockApi.resetDemo();
  },
  /** architecture §12 — second victim reports near the newest open incident (or the demo centre). */
  async injectSecondReport(): Promise<string> {
    db = load();
    const newest = [...db.incidents].filter((i) => i.status === 'NEW' || i.status === 'VERIFIED' || i.status === 'IN_PROGRESS')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const lat = newest?.lat ?? DEMO_CENTER.lat;
    const lng = newest?.lng ?? DEMO_CENTER.lng;
    const code = newReportCode();
    await mockApi.submitReport({
      id: newUuid(), code, pin: '5678', deviceId: SECOND_REPORT.deviceId, text: SECOND_REPORT.text, lat: lat + 0.0003, lng,
      locationText: 'Central Street', people: null, needs: [], phone: SECOND_REPORT.phone,
      photoBase64: btoa(DEMO_PHOTO_SVG), audioBase64: null, audioMime: null, audioSeconds: null, createdAt: nowIso(),
    });
    // The second reporter verified their phone (demo step 4) — mark it directly.
    db = load();
    const r = db.reports.find((x) => x.code === code);
    if (r) { r.phoneVerified = true; save(); }
    return code;
  },
  failNextRequest(): void {
    failNext = true;
  },
  usingRealLocation: useReal,
  setUseRealLocation(value: boolean): void {
    try { sessionStorage.setItem(REAL_LOCATION_KEY, value ? '1' : '0'); } catch { /* ignore */ }
    setPositionOverride(value ? null : DEMO_POSITION);
  },
};
