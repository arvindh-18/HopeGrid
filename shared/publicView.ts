// shared/publicView.ts — the ONLY way incidents leave the system to anonymous users (BR-80…BR-84, AR-22).
import { NEARBY_RADIUS_M, PUBLIC_RESOLVED_HOURS } from './constants';
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
  /** F28: set when auto-dispatch sent a volunteer; no coordinator has looked at it yet. */
  autoDispatchedAt?: string | null;
  onSiteAt?: string | null;
  confidence: number;
  effectivePriority: PriorityLevel;
  reportCount: number;
  updatedAt: string;
}

/**
 * BR-80. An incident reaches the public map only after a coordinator has acted on it (verified it, sent a volunteer,
 * or resolved it). NEW incidents are never public, whatever their confidence: one unverified report — with a photo,
 * or a phone "verified" with the demo OTP — would otherwise be enough to put a hazard on the community map.
 */
export function isPublic(i: PublicSourceIncident, now: Date = new Date()): boolean {
  if (i.lat === null || i.lng === null) return false;
  if (i.status === 'VERIFIED') return true;
  // IN_PROGRESS: a coordinator sent a volunteer. When the system sent one (auto-dispatch, BR-165), no person has
  // judged the report yet: wait until a coordinator verifies it or the volunteer reaches the place.
  if (i.status === 'IN_PROGRESS') return !i.autoDispatchedAt || !!i.verifiedAt || !!i.onSiteAt;
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

/** BR-85 — the hazards within radiusM of the device (shown on the map), and how many are farther away (hidden). */
export function withinRadius(list: PublicIncident[], lat: number, lng: number, radiusM: number): { inside: PublicIncident[]; fartherCount: number } {
  const inside = list.filter((p) => distanceMeters(lat, lng, p.lat, p.lng) <= radiusM);
  return { inside, fartherCount: list.length - inside.length };
}

/** BR-82 — hazards (RED/ORANGE) within NEARBY_RADIUS_M of the device. */
export function nearbyHazards(list: PublicIncident[], lat: number, lng: number): PublicIncident[] {
  return list.filter(
    (p) => (p.color === 'RED' || p.color === 'ORANGE') && distanceMeters(lat, lng, p.lat, p.lng) <= NEARBY_RADIUS_M,
  );
}
