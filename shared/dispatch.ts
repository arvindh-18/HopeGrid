// shared/dispatch.ts — auto-dispatch rules (features.md F28, rules.md BR-160…BR-166). Pure functions: the server's
// dispatcher (server/dispatch.ts) decides with these, and tests/rules.test.ts checks them. The volunteer itself is
// chosen by the existing ranking (rankVolunteers, BR-60…BR-63).
import {
  CODE_ALPHABET, DISPATCH_DEFAULT_RESPONSE_MINUTES, DISPATCH_DEFAULT_THRESHOLD, DISPATCH_MAX_RESPONSE_MINUTES,
  DISPATCH_MAX_THRESHOLD, INCIDENT_CODE_LENGTH,
} from './constants';
import { effectivePriority, priorityRank } from './scoring';
import {
  ACTIVE_ASSIGNMENT, DISPATCH_MODES,
  type AssignmentStatus, type DispatchSettings, type IncidentStatus, type IncidentType, type PriorityLevel, type VolunteerReply,
} from './types';

export const DEFAULT_DISPATCH: DispatchSettings = {
  mode: 'OFF', threshold: DISPATCH_DEFAULT_THRESHOLD, responseMinutes: DISPATCH_DEFAULT_RESPONSE_MINUTES,
};

/** BR-160: dispatch settings from a coordinator, checked. Returns the settings, or the reason they are invalid. */
export function checkDispatchSettings(input: unknown): DispatchSettings | string {
  const b = (input ?? {}) as Record<string, unknown>;
  if (!(DISPATCH_MODES as readonly unknown[]).includes(b.mode)) return 'Choose Off, When overloaded or Always.';
  const whole = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  if (!whole(b.threshold, 1, DISPATCH_MAX_THRESHOLD)) return `The threshold must be a whole number from 1 to ${DISPATCH_MAX_THRESHOLD}.`;
  if (!whole(b.responseMinutes, 1, DISPATCH_MAX_RESPONSE_MINUTES)) {
    return `The answer time must be a whole number of minutes from 1 to ${DISPATCH_MAX_RESPONSE_MINUTES}.`;
  }
  return { mode: b.mode as DispatchSettings['mode'], threshold: b.threshold as number, responseMinutes: b.responseMinutes as number };
}

export interface WaitingSource {
  id: string;
  status: IncidentStatus;
  priority: PriorityLevel;
  priorityOverride: PriorityLevel | null;
  escalationRecommended: boolean;
  escalatedAt: string | null;
  createdAt: string;
}
interface AssignmentLite { incidentId: string; status: AssignmentStatus }

/**
 * BR-160: incidents waiting for a volunteer — NEW or VERIFIED with no active assignment — most urgent first, in the
 * dashboard's order (BR-120): effective priority, then "escalation recommended and not escalated", then oldest.
 */
export function waitingIncidents<T extends WaitingSource>(incidents: T[], assignments: AssignmentLite[]): T[] {
  const busy = new Set(assignments.filter((a) => ACTIVE_ASSIGNMENT.includes(a.status)).map((a) => a.incidentId));
  const urgent = (i: T) => Number(i.escalationRecommended && !i.escalatedAt);
  return incidents
    .filter((i) => (i.status === 'NEW' || i.status === 'VERIFIED') && !busy.has(i.id))
    .sort((a, b) =>
      priorityRank(effectivePriority(b.priority, b.priorityOverride)) - priorityRank(effectivePriority(a.priority, a.priorityOverride)) ||
      urgent(b) - urgent(a) ||
      a.createdAt.localeCompare(b.createdAt));
}

/**
 * BR-161: which waiting incidents the system dispatches now. OFF: none. ALWAYS: all of them. OVERLOAD: all of them,
 * but only while more than `threshold` are waiting (the coordinators can't keep up); otherwise none.
 */
export function incidentsToDispatch<T>(settings: DispatchSettings, waiting: T[]): T[] {
  if (settings.mode === 'ALWAYS') return waiting;
  if (settings.mode === 'OVERLOAD' && waiting.length > settings.threshold) return waiting;
  return [];
}

/** BR-162: SOS offers still unanswered after their answer time. Assignments made by a coordinator have no deadline. */
export function expiredOffers<T extends { status: AssignmentStatus; auto: boolean; respondBy: string | null }>(assignments: T[], now: Date): T[] {
  return assignments.filter((a) => a.auto && a.status === 'ASSIGNED' && a.respondBy !== null && Date.parse(a.respondBy) <= now.getTime());
}

const REPLY_RE = new RegExp(`^(YES|Y|ACCEPT|NO|N|DECLINE)(?:\\s+#?([${CODE_ALPHABET}]{${INCIDENT_CODE_LENGTH}}))?$`);

/** BR-163: a volunteer's SMS answer — YES / NO, optionally followed by the incident code ("YES WF22W"). Else null. */
export function parseVolunteerReply(text: string): VolunteerReply | null {
  const m = REPLY_RE.exec(text.trim().toUpperCase().replace(/[.!,]+$/, '').replace(/\s+/g, ' '));
  if (!m) return null;
  return { answer: ['YES', 'Y', 'ACCEPT'].includes(m[1]) ? 'ACCEPT' : 'DECLINE', code: m[2] ?? null };
}

export interface SosSource {
  code: string;
  type: IncidentType;
  priority: PriorityLevel;
  people: number | null;
  trapped: boolean;
  medical: boolean;
  vulnerable: boolean;
  locationText: string | null;
}

/** BR-164: what the SOS says, for SMS and push: type, priority, key facts, place and distance. Never a reporter's name or
 * number (AR-23). */
export function sosSummary(i: SosSource, distanceText: string | null, label: (v: string) => string): string {
  const facts = [
    `${label(i.type)}, ${label(i.priority)} priority`,
    i.people !== null ? `${i.people} people` : null,
    i.trapped ? 'trapped' : null,
    i.medical ? 'medical' : null,
    i.vulnerable ? 'vulnerable person' : null,
  ].filter(Boolean).join(', ');
  const where = [i.locationText ? i.locationText.slice(0, 40) : null, distanceText ? `${distanceText} away` : null].filter(Boolean).join(', ');
  return `${facts}${where ? ` at ${where}` : ''}`;
}

/** BR-164: the SOS SMS. The volunteer answers with YES/NO and the code (BR-163). */
export const sosSms = (i: SosSource, summary: string, minutes: number): string =>
  `HopeGrid SOS #${i.code}: ${summary}. Reply YES ${i.code} to accept or NO ${i.code} to decline within ${minutes} min.`;

/** BR-164: the push notification. Tapping it opens the volunteer screen with the SOS. */
export const sosPush = (i: SosSource, summary: string, minutes: number): { title: string; body: string } =>
  ({ title: `SOS #${i.code}: help needed`, body: `${summary}. Accept or decline within ${minutes} min.` });
