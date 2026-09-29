// shared/linking.ts — duplicates, related incidents (cascade) and merge field rules (BR-40…BR-52).
import {
  DUP_CLOSE_DISTANCE_M, DUP_MAX_DISTANCE_M, DUP_MAX_HOURS, RELATED_MAX_DISTANCE_M, RELATED_MAX_HOURS, STOPWORDS,
} from './constants';
import type { IncidentStatus, IncidentType, Need, PriorityLevel } from './types';
import { ACTIVE_STATUSES, SITUATION_TYPES } from './types';

// ---------- Geo ----------
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface HasCoords { lat: number | null; lng: number | null }
export function distanceBetween(a: HasCoords, b: HasCoords): number | null {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;
  return distanceMeters(a.lat, a.lng, b.lat, b.lng);
}

// ---------- Text ----------
export function tokens(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z\u0B80-\u0BFF]+/g) ?? [];
  return new Set(words.filter((w) => w.length >= 4 && !STOPWORDS.includes(w)));
}
const normPlace = (p: string) => p.toLowerCase().trim();

export function sharePlace(a: string[], b: string[]): boolean {
  const set = new Set(a.map(normPlace));
  return b.some((p) => set.has(normPlace(p)));
}

export function textMatch(a: LinkIncident, b: LinkIncident): boolean {
  if (sharePlace(a.places, b.places)) return true;
  const ta = tokens(a.text);
  let shared = 0;
  for (const t of tokens(b.text)) if (ta.has(t)) shared++;
  return shared >= 2;
}

// ---------- Duplicates (BR-40…BR-43) ----------
export interface LinkIncident {
  id: string;
  code: string;
  type: IncidentType;
  status: IncidentStatus;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  places: string[];
  text: string; // summary + report texts/transcripts
  possibleDuplicateOf: string | null;
}

export function compatibleTypes(a: IncidentType, b: IncidentType): boolean {
  return a === b || SITUATION_TYPES.includes(a) || SITUATION_TYPES.includes(b);
}

const hoursApart = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;

export function findDuplicate(n: LinkIncident, all: LinkIncident[]): { id: string; distanceM: number | null } | null {
  const candidates: { e: LinkIncident; d: number | null }[] = [];
  for (const e of all) {
    if (e.id === n.id || !ACTIVE_STATUSES.includes(e.status)) continue;
    if (hoursApart(n.createdAt, e.createdAt) > DUP_MAX_HOURS) continue;
    if (!compatibleTypes(n.type, e.type)) continue;
    const d = distanceBetween(n, e);
    const ok =
      (d !== null && d <= DUP_CLOSE_DISTANCE_M) ||
      (d !== null && d <= DUP_MAX_DISTANCE_M && textMatch(n, e)) ||
      (d === null && sharePlace(n.places, e.places));
    if (ok) candidates.push({ e, d });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.d !== null && b.d !== null) return a.d - b.d;
    if (a.d !== null) return -1;
    if (b.d !== null) return 1;
    return new Date(b.e.createdAt).getTime() - new Date(a.e.createdAt).getTime();
  });
  return { id: candidates[0].e.id, distanceM: candidates[0].d };
}

// ---------- Related incidents / cascade (BR-45) ----------
export const CASCADE: Partial<Record<IncidentType, IncidentType[]>> = {
  HEAVY_RAIN: ['FLOOD', 'LANDSLIDE'],
  CYCLONE: ['FLOOD', 'POWER_OUTAGE', 'ROAD_BLOCKED'],
  FLOOD: ['ROAD_BLOCKED', 'POWER_OUTAGE', 'PEOPLE_TRAPPED'],
  LANDSLIDE: ['ROAD_BLOCKED', 'PEOPLE_TRAPPED'],
  FIRE: ['POWER_OUTAGE', 'PEOPLE_TRAPPED'],
  BUILDING_COLLAPSE: ['PEOPLE_TRAPPED'],
};
const causes = (a: IncidentType, b: IncidentType) => CASCADE[a]?.includes(b) ?? false;

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export function findRelated(
  i: LinkIncident,
  all: LinkIncident[],
  typeLabel: (t: IncidentType) => string,
): { id: string; code: string; type: IncidentType; text: string; distanceM: number }[] {
  const out: { id: string; code: string; type: IncidentType; text: string; distanceM: number }[] = [];
  for (const r of all) {
    if (r.id === i.id || r.id === i.possibleDuplicateOf) continue;
    if (!ACTIVE_STATUSES.includes(r.status) && r.status !== 'RESOLVED') continue;
    const d = distanceBetween(i, r);
    if (d === null || d > RELATED_MAX_DISTANCE_M) continue;
    if (hoursApart(i.createdAt, r.createdAt) > RELATED_MAX_HOURS) continue;
    if (!causes(r.type, i.type) && !causes(i.type, r.type)) continue;
    const mins = Math.round((new Date(r.createdAt).getTime() - new Date(i.createdAt).getTime()) / 60_000);
    const when = mins === 0 ? 'at the same time' : `${Math.abs(mins)} min ${mins < 0 ? 'earlier' : 'later'}`;
    out.push({ id: r.id, code: r.code, type: r.type, distanceM: d, text: `${typeLabel(r.type)} · ${formatDistance(d)} away · ${when}` });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

// ---------- Merge field rules (BR-50) ----------
export interface MergeableIncident {
  type: IncidentType;
  status: IncidentStatus;
  people: number | null;
  vulnerable: boolean;
  trapped: boolean;
  medical: boolean;
  danger: boolean;
  needs: Need[];
  lat: number | null;
  lng: number | null;
  locationText: string | null;
  publicArea: string | null;
  summary: string | null;
  verifiedAt: string | null;
  escalatedAt: string | null;
  onSiteAt: string | null;
  priorityOverride: PriorityLevel | null;
  overrideReason: string | null;
}

const earliest = (a: string | null, b: string | null) => {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) <= new Date(b) ? a : b;
};
const STATUS_RANK: Partial<Record<IncidentStatus, number>> = { NEW: 0, VERIFIED: 1, IN_PROGRESS: 2 };

export function mergeFields(t: MergeableIncident, s: MergeableIncident): MergeableIncident {
  const people = t.people === null ? s.people : s.people === null ? t.people : Math.max(t.people, s.people);
  const type = SITUATION_TYPES.includes(t.type) && !SITUATION_TYPES.includes(s.type) ? s.type : t.type;
  const status = (STATUS_RANK[s.status] ?? 0) > (STATUS_RANK[t.status] ?? 0) ? s.status : t.status;
  return {
    type,
    status,
    people,
    vulnerable: t.vulnerable || s.vulnerable,
    trapped: t.trapped || s.trapped,
    medical: t.medical || s.medical,
    danger: t.danger || s.danger,
    needs: [...new Set([...t.needs, ...s.needs])],
    lat: t.lat ?? s.lat,
    lng: t.lat !== null ? t.lng : s.lng,
    locationText: t.locationText ?? s.locationText,
    publicArea: t.publicArea ?? s.publicArea,
    summary: t.summary ?? s.summary,
    verifiedAt: earliest(t.verifiedAt, s.verifiedAt),
    escalatedAt: earliest(t.escalatedAt, s.escalatedAt),
    onSiteAt: earliest(t.onSiteAt, s.onSiteAt),
    priorityOverride: t.priorityOverride ?? s.priorityOverride,
    overrideReason: t.priorityOverride ? t.overrideReason : s.overrideReason,
  };
}
