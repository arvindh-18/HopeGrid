// shared/scoring.ts — confidence, priority, escalation (rules.md BR-20…BR-32).
// Confidence and priority are independent: neither reads the other (AR-21).
import { CONFIDENCE, PRIORITY, RECENT_REPORT_MINUTES } from './constants';
import type { ConfidenceBand, IncidentType, PriorityLevel, Reason } from './types';

export interface ConfidenceIncidentInput { verifiedAt: string | null; onSiteAt: string | null }
export interface ConfidenceReportInput { deviceId: string; hasPhoto: boolean; receivedAt: string; phoneVerified: boolean }

export function computeConfidence(
  incident: ConfidenceIncidentInput,
  reports: ConfidenceReportInput[],
  now: Date = new Date(),
): { score: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  if (reports.length === 0) return { score: 0, reasons };

  reasons.push({ label: 'Report received', points: CONFIDENCE.BASE });

  const devices = new Set(reports.map((r) => r.deviceId)).size;
  if (devices > 1) {
    const pts = Math.min((devices - 1) * CONFIDENCE.EXTRA_REPORT, CONFIDENCE.EXTRA_REPORT_MAX);
    reasons.push({ label: `${devices} independent reports`, points: pts });
  }
  if (reports.some((r) => r.hasPhoto)) reasons.push({ label: 'Photo evidence', points: CONFIDENCE.PHOTO });

  const newest = Math.max(...reports.map((r) => new Date(r.receivedAt).getTime()));
  if (now.getTime() - newest <= RECENT_REPORT_MINUTES * 60_000) {
    reasons.push({ label: 'Recent report', points: CONFIDENCE.RECENT });
  }
  if (reports.some((r) => r.phoneVerified)) reasons.push({ label: 'Reporter phone verified', points: CONFIDENCE.PHONE });

  if (incident.verifiedAt) reasons.push({ label: 'Confirmed by coordinator', points: CONFIDENCE.CORROBORATED });
  else if (incident.onSiteAt) reasons.push({ label: 'Confirmed by volunteer on site', points: CONFIDENCE.CORROBORATED });

  const sum = reasons.reduce((s, r) => s + r.points, 0);
  return { score: Math.max(0, Math.min(sum, CONFIDENCE.MAX)), reasons };
}

export function confidenceBand(score: number): ConfidenceBand {
  if (score >= CONFIDENCE.BAND_HIGH) return 'HIGH';
  if (score >= CONFIDENCE.BAND_MEDIUM) return 'MEDIUM';
  return 'LOW';
}

export interface PriorityInput {
  type: IncidentType;
  people: number | null;
  vulnerable: boolean;
  trapped: boolean;
  medical: boolean;
  danger: boolean;
}

const SEVERE_TYPES: IncidentType[] = ['FIRE', 'BUILDING_COLLAPSE', 'LANDSLIDE', 'FLOOD', 'CYCLONE'];
const ORDER: PriorityLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function levelFromScore(score: number): PriorityLevel {
  if (score >= PRIORITY.CRITICAL) return 'CRITICAL';
  if (score >= PRIORITY.HIGH) return 'HIGH';
  if (score >= PRIORITY.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

export function computePriority(i: PriorityInput): { score: number; level: PriorityLevel; reasons: Reason[] } {
  const reasons: Reason[] = [];
  if (i.people === null) reasons.push({ label: 'Number of people unknown', points: PRIORITY.PEOPLE_1_OR_UNKNOWN });
  else if (i.people >= 5) reasons.push({ label: `${i.people} people affected`, points: PRIORITY.PEOPLE_5PLUS });
  else if (i.people >= 2) reasons.push({ label: `${i.people} people affected`, points: PRIORITY.PEOPLE_2TO4 });
  else if (i.people === 1) reasons.push({ label: 'People affected', points: PRIORITY.PEOPLE_1_OR_UNKNOWN });

  if (i.trapped) reasons.push({ label: 'People trapped / exit blocked', points: PRIORITY.TRAPPED });
  if (i.vulnerable) reasons.push({ label: 'Vulnerable person (elderly, child, disabled…)', points: PRIORITY.VULNERABLE });
  if (i.medical) reasons.push({ label: 'Medical need', points: PRIORITY.MEDICAL });
  if (i.danger) reasons.push({ label: 'Immediate danger', points: PRIORITY.DANGER });
  if (SEVERE_TYPES.includes(i.type)) reasons.push({ label: 'Severe hazard type', points: PRIORITY.SEVERE_TYPE });

  const score = reasons.reduce((s, r) => s + r.points, 0);
  let level = levelFromScore(score);
  if (i.trapped && (i.vulnerable || i.medical) && level !== 'CRITICAL') {
    level = 'CRITICAL';
    reasons.push({ label: 'Trapped person with vulnerability/medical need → critical', points: 0 });
  }
  return { score, level, reasons };
}

export function effectivePriority(computed: PriorityLevel, override: PriorityLevel | null): PriorityLevel {
  return override ?? computed;
}

export function priorityRank(level: PriorityLevel): number {
  return ORDER.indexOf(level);
}

export function computeEscalation(i: PriorityInput & { effectivePriority: PriorityLevel }): { recommended: boolean; reasons: Reason[] } {
  const extra: Reason[] = [];
  if (i.medical) extra.push({ label: 'Medical need', points: 0 });
  if (i.vulnerable) extra.push({ label: 'Vulnerable person involved', points: 0 });
  if (i.people !== null && i.people >= 5) extra.push({ label: `${i.people} people affected`, points: 0 });
  const recommended = i.effectivePriority === 'CRITICAL' && i.trapped && extra.length > 0;
  if (!recommended) return { recommended: false, reasons: [] };
  return {
    recommended: true,
    reasons: [{ label: 'Critical priority', points: 0 }, { label: 'People trapped', points: 0 }, ...extra],
  };
}
