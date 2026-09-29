// shared/publicView.ts — the ONLY way incidents leave the system to anonymous users (BR-80…BR-84, AR-22).
import { NEARBY_RADIUS_M, PUBLIC_MIN_CONFIDENCE, PUBLIC_RESOLVED_HOURS } from './constants';
import { distanceMeters } from './linking';
import { confidenceBand } from './scoring';
import type { IncidentStatus, IncidentType, MarkerColor, PriorityLevel, PublicIncident, PublicStatus } from './types';

export interface PublicSourceIncident {
  code: string;
  type: IncidentType;
  status: IncidentStatus;
  lat: number | null;
  lng: number | null;
  publicArea: string | null;
  verifiedAt: string | null;
  resolvedAt: string | null;
  confidence: number;
  effectivePriority: PriorityLevel;
  reportCount: number;
  updatedAt: string;
}

export function isPublic(i: PublicSourceIncident, now: Date = new Date()): boolean {
  if (i.lat === null || i.lng === null) return false;
  if (i.status === 'VERIFIED' || i.status === 'IN_PROGRESS') return true;
  if (i.status === 'NEW') return i.confidence >= PUBLIC_MIN_CONFIDENCE;
  if (i.status === 'RESOLVED' && i.resolvedAt) {
    return now.getTime() - new Date(i.resolvedAt).getTime() <= PUBLIC_RESOLVED_HOURS * 3_600_000;
  }
  return false;
}

export function markerColor(status: IncidentStatus, priority: PriorityLevel, type: IncidentType): MarkerColor {
  if (status === 'RESOLVED') return 'GREEN';
  if (priority === 'CRITICAL') return 'RED';
  if (type === 'ROAD_BLOCKED' || type === 'POWER_OUTAGE') return 'YELLOW';
  return 'ORANGE';
}

const ADVICE: Record<IncidentType, string> = {
  FLOOD: 'Avoid this area. Do not walk or drive through flood water.',
  CYCLONE: 'Stay indoors away from windows. Avoid travel.',
  HEAVY_RAIN: 'Avoid low-lying roads and underpasses.',
  FIRE: 'Keep away. Do not block access for fire services.',
  LANDSLIDE: 'Avoid slopes and this road.',
  BUILDING_COLLAPSE: 'Keep away from damaged structures.',
  ROAD_BLOCKED: 'Use another route.',
  POWER_OUTAGE: 'Stay away from fallen or live wires.',
  PEOPLE_TRAPPED: 'Keep the area clear for responders.',
  MEDICAL: 'Keep the area clear for responders.',
  OTHER: 'Keep the area clear for responders.',
};

export function publicStatus(status: IncidentStatus): PublicStatus {
  if (status === 'IN_PROGRESS') return 'RESPONDING';
  if (status === 'RESOLVED') return 'RESOLVED';
  return 'ACTIVE';
}

export function adviceFor(type: IncidentType, status: PublicStatus): string {
  if (status === 'RESOLVED') return 'Resolved. Take care when moving through the area.';
  if (status === 'RESPONDING') return `${ADVICE[type]} Responders are on site or on the way.`;
  return ADVICE[type];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function toPublicIncident(i: PublicSourceIncident): PublicIncident {
  const status = publicStatus(i.status);
  return {
    code: i.code,
    type: i.type,
    color: markerColor(i.status, i.effectivePriority, i.type),
    area: i.verifiedAt ? i.publicArea : null,
    lat: round3(i.lat ?? 0),
    lng: round3(i.lng ?? 0),
    priority: i.effectivePriority,
    confidenceBand: confidenceBand(i.confidence),
    verified: i.verifiedAt !== null,
    reportCount: i.reportCount,
    status,
    advice: adviceFor(i.type, status),
    updatedAt: i.updatedAt,
  };
}

/** BR-82 — hazards (RED/ORANGE) within NEARBY_RADIUS_M of the device. */
export function nearbyHazards(list: PublicIncident[], lat: number, lng: number): PublicIncident[] {
  return list.filter(
    (p) => (p.color === 'RED' || p.color === 'ORANGE') && distanceMeters(lat, lng, p.lat, p.lng) <= NEARBY_RADIUS_M,
  );
}
