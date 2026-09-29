// server/mappers.ts — the ONLY place DB snake_case ↔ API camelCase conversion happens (rules.md AR-15).
import type { ReportSubmission } from '../shared/types';

/** New `reports` row from a victim submission (architecture §6.3). Media paths come from storage. */
export function submissionToReportRow(
  sub: ReportSubmission,
  media: { photoPath: string | null; audioPath: string | null },
) {
  return {
    id: sub.id,
    code: sub.code,
    pin: sub.pin,
    device_id: sub.deviceId,
    text: sub.text,
    transcript_status: 'NONE',
    lat: sub.lat,
    lng: sub.lng,
    location_text: sub.locationText,
    people: sub.people,
    needs: sub.needs,
    phone: sub.phone,
    phone_verified: false,
    photo_path: media.photoPath,
    audio_path: media.audioPath,
    audio_seconds: sub.audioSeconds,
    processing_status: 'PENDING',
    created_at: sub.createdAt,
  };
}
