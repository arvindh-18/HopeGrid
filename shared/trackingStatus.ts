// shared/trackingStatus.ts — internal state → victim-facing step (rules.md BR-90, BR-91).
import { EMERGENCY_NUMBER } from './constants';
import type { AssignmentStatus, IncidentStatus, ProcessingStatus, VictimStep } from './types';
import { ACTIVE_ASSIGNMENT } from './types';

export interface TrackingInput {
  processingStatus: ProcessingStatus;
  incident: { status: IncidentStatus; verifiedAt: string | null } | null;
  /** Assignments of the incident, newest last. */
  assignments: { status: AssignmentStatus }[];
}

export function victimStep(t: TrackingInput): VictimStep {
  if (t.processingStatus === 'PENDING' || !t.incident) return 'RECEIVED';
  if (t.incident.status === 'REJECTED') return 'CLOSED';
  if (t.incident.status === 'RESOLVED') return 'RESOLVED';
  const active = t.assignments.find((a) => ACTIVE_ASSIGNMENT.includes(a.status));
  const latest = t.assignments[t.assignments.length - 1];
  if (active && (active.status === 'ON_SITE' || active.status === 'ASSISTING')) return 'ARRIVED';
  if (!active && latest?.status === 'DONE') return 'ARRIVED';
  if (active?.status === 'EN_ROUTE') return 'ON_THE_WAY';
  if (active?.status === 'ACCEPTED') return 'HELP_ASSIGNED';
  if (t.incident.verifiedAt) return 'VERIFIED';
  return 'REVIEWING';
}

export const STEP_LABELS: Record<Exclude<VictimStep, 'CLOSED'>, string> = {
  RECEIVED: 'Report received',
  REVIEWING: 'Being reviewed by the coordination team',
  VERIFIED: 'Verified — arranging help',
  HELP_ASSIGNED: 'A volunteer has been assigned',
  ON_THE_WAY: 'Help is on the way',
  ARRIVED: 'Help has arrived',
  RESOLVED: 'Resolved',
};

export function closedMessage(emergencyNumber: string = EMERGENCY_NUMBER): string {
  return `We could not verify this report. If you are still in danger, call ${emergencyNumber} or send a new report.`;
}
