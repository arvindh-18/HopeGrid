// server/mappers.ts — the ONLY place DB snake_case ↔ API camelCase conversion happens (rules.md AR-15).
// Only top-level keys are converted; jsonb values (extraction, reasons) are stored as-is.
import type { ReportRecord, ReportSubmission } from '../shared/types';

const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** DB row → camelCase record. Timestamps (keys ending in "At") become ISO 8601 UTC strings (rules.md C2). */
export function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = toCamel(k);
    out[key] = key.endsWith('At') && typeof v === 'string' ? new Date(v).toISOString() : v;
  }
  return out as T;
}
export const fromRows = <T>(rows: Record<string, unknown>[] | null): T[] => (rows ?? []).map((r) => fromRow<T>(r));

/** camelCase object → DB row. Undefined values are left out, so partial patches stay partial. */
export function toRow(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[toSnake(k)] = v;
  return out;
}

/** New `reports` row from a victim submission (architecture §6.3). Media paths come from storage. */
export function submissionToReportRow(
  sub: ReportSubmission,
  media: { photoPath: string | null; audioPath: string | null },
) {
  const record: Omit<ReportRecord, 'incidentId' | 'transcript' | 'extraction' | 'aiSource' | 'receivedAt'> = {
    id: sub.id,
    code: sub.code,
    pin: sub.pin,
    deviceId: sub.deviceId,
    text: sub.text,
    transcriptStatus: 'NONE',
    lat: sub.lat,
    lng: sub.lng,
    locationText: sub.locationText,
    people: sub.people,
    needs: sub.needs,
    phone: sub.phone,
    phoneVerified: false,
    photoPath: media.photoPath,
    audioPath: media.audioPath,
    audioSeconds: sub.audioSeconds,
    processingStatus: 'PENDING',
    createdAt: sub.createdAt,
  };
  return toRow(record);
}
