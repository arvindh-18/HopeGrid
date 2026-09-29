// shared/constants.ts — every number used by rules lives here (rules.md C1, AR-10).

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REPORT_CODE_LENGTH = 6;
export const INCIDENT_CODE_LENGTH = 5;
export const PIN_LENGTH = 4;

export const EMERGENCY_NUMBER = '112';
export const DEMO_OTP = '123456';
export const DEMO_CENTER = { lat: 13.0405, lng: 80.2337 };

// BR-03 submission validation
export const MIN_REPORT_TEXT = 5;
export const MAX_PEOPLE = 500;
export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 15;

export const MAX_AUDIO_SECONDS = 60;
export const MAX_PHOTO_BASE64 = 3_000_000;
export const MAX_AUDIO_BASE64 = 3_000_000;
export const AI_TIMEOUT_MS = 30_000;
export const WHISPER_TIMEOUT_MS = 60_000;

export const OUTBOX_RETRY_MS = 15_000;
export const POLL_ADMIN_MS = 5_000;
export const POLL_VOLUNTEER_MS = 5_000;
export const POLL_CHAT_MS = 4_000;
export const POLL_TRACK_MS = 10_000;
export const POLL_PUBLIC_MS = 15_000;

export const DUP_CLOSE_DISTANCE_M = 200;
export const DUP_MAX_DISTANCE_M = 500;
export const DUP_MAX_HOURS = 3;
export const RELATED_MAX_DISTANCE_M = 2000;
export const RELATED_MAX_HOURS = 12;

export const PUBLIC_MIN_CONFIDENCE = 50;
export const PUBLIC_RESOLVED_HOURS = 6;
export const NEARBY_RADIUS_M = 2000;
export const RECENT_REPORT_MINUTES = 60;
export const OFFLINE_SUBMIT_THRESHOLD_MIN = 2;
export const SIGNED_URL_SECONDS = 3600;

export const CONFIDENCE = {
  BASE: 35,
  EXTRA_REPORT: 20,
  EXTRA_REPORT_MAX: 40,
  PHOTO: 15,
  RECENT: 10,
  PHONE: 5,
  CORROBORATED: 20,
  MAX: 99,
  BAND_MEDIUM: 50,
  BAND_HIGH: 75,
} as const;

export const PRIORITY = {
  PEOPLE_5PLUS: 20,
  PEOPLE_2TO4: 12,
  PEOPLE_1_OR_UNKNOWN: 6,
  TRAPPED: 25,
  VULNERABLE: 15,
  MEDICAL: 20,
  DANGER: 15,
  SEVERE_TYPE: 10,
  CRITICAL: 70,
  HIGH: 45,
  MEDIUM: 20,
} as const;

export const MATCH = {
  SKILLS: 50,
  EQUIPMENT: 25,
  DIST_2KM: 25,
  DIST_5KM: 15,
  DIST_10KM: 5,
  DIST_UNKNOWN: 10,
  TOP_N: 3,
} as const;

export const STOPWORDS = [
  'the', 'and', 'with', 'near', 'there', 'their', 'have', 'this', 'that', 'from', 'water', 'help',
  'please', 'some', 'very', 'into', 'they', 'were', 'been', 'what', 'when', 'where',
];
