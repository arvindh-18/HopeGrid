// shared/sms.ts — the SMS fallback format (rules.md BR-06, features.md F27). With no internet the app packs a report
// into one SMS that the phone's own SMS app sends to the HopeGrid number; the server unpacks it. A message without
// the header is a plain-words report (e.g. from a basic phone).
//
//   HG1 K7P2QX 4821          header: format version, report code, PIN (the same ones the phone shows)
//   G 13.08270 80.27070      GPS position
//   P 4                      people
//   N RM                     needs, one letter each (NEED_LETTER)
//   M AI                     still on the phone: A = voice note, I = photo (they come with the full report, BR-07)
//   L near the temple        location description
//   T water rising …         description (always last)
//
// Every line after the header is optional. The server drops a line it can't read, never the whole report.
import {
  CODE_ALPHABET, MAX_PEOPLE, MAX_REPORT_TEXT, PIN_LENGTH, REPORT_CODE_LENGTH, SMS_LOCATION_MAX_CHARS, SMS_TEXT_MAX_CHARS,
} from './constants';
import { NEEDS, type Need, type PendingMedia, type ReportSubmission, type SmsReport } from './types';

export const SMS_FORMAT = 'HG1';

export const NEED_LETTER: Record<Need, string> = {
  EVACUATION: 'E', RESCUE: 'R', MEDICAL: 'M', PHYSICAL_HELP: 'H', FOOD_WATER: 'F', SHELTER: 'S', OTHER: 'O',
};
const MEDIA_LETTER: Record<PendingMedia, string> = { AUDIO: 'A', PHOTO: 'I' };

const HEADER_RE = new RegExp(`^${SMS_FORMAT}\\s+([${CODE_ALPHABET}]{${REPORT_CODE_LENGTH}})\\s+(\\d{${PIN_LENGTH}})$`);

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Shortens to `max` characters, marking the cut with "…". */
export const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

type Packable = Pick<ReportSubmission, 'code' | 'pin' | 'lat' | 'lng' | 'locationText' | 'people' | 'needs' | 'photoBase64' | 'audioBase64' | 'text'>;

/** The SMS body for a saved report. Long text is shortened; the full text arrives with the app upload. */
export function encodeSmsReport(sub: Packable): string {
  const lines = [`${SMS_FORMAT} ${sub.code} ${sub.pin}`];
  if (sub.lat !== null && sub.lng !== null) lines.push(`G ${sub.lat.toFixed(5)} ${sub.lng.toFixed(5)}`);
  if (sub.people !== null) lines.push(`P ${sub.people}`);
  if (sub.needs.length) lines.push(`N ${NEEDS.filter((n) => sub.needs.includes(n)).map((n) => NEED_LETTER[n]).join('')}`);
  const media = [sub.audioBase64 ? MEDIA_LETTER.AUDIO : '', sub.photoBase64 ? MEDIA_LETTER.PHOTO : ''].join('');
  if (media) lines.push(`M ${media}`);
  const place = oneLine(sub.locationText ?? '');
  if (place) lines.push(`L ${clip(place, SMS_LOCATION_MAX_CHARS)}`);
  const text = oneLine(sub.text);
  if (text) lines.push(`T ${clip(text, SMS_TEXT_MAX_CHARS)}`);
  return lines.join('\n');
}

/** Unpacks an app-made SMS. Null when the message has no valid header: then it is a plain-words report. */
export function parseSmsReport(message: string): SmsReport | null {
  const lines = message.replace(/\r\n?/g, '\n').trim().split('\n');
  const head = HEADER_RE.exec(lines[0].trim().toUpperCase());
  if (!head) return null;
  const r: SmsReport = {
    code: head[1], pin: head[2], lat: null, lng: null, locationText: null, people: null, needs: [], pendingMedia: [], text: '',
  };
  for (let n = 1; n < lines.length; n++) {
    const m = /^([A-Za-z])\s(.*)$/.exec(lines[n].trim());
    if (!m) continue;
    const key = m[1].toUpperCase();
    const value = m[2].trim();
    if (key === 'T') {
      // The description is last and keeps everything after it.
      r.text = clip([value, ...lines.slice(n + 1)].join('\n').trim(), MAX_REPORT_TEXT);
      break;
    }
    if (key === 'G') {
      const [lat, lng, extra] = value.split(/\s+/);
      const la = Number(lat);
      const ln = Number(lng);
      if (extra === undefined && lat && lng && Math.abs(la) <= 90 && Math.abs(ln) <= 180) {
        r.lat = la;
        r.lng = ln;
      }
    } else if (key === 'P') {
      if (/^\d{1,3}$/.test(value) && Number(value) <= MAX_PEOPLE) r.people = Number(value);
    } else if (key === 'N') {
      const letters = value.toUpperCase();
      r.needs = NEEDS.filter((need) => letters.includes(NEED_LETTER[need]));
    } else if (key === 'M') {
      const letters = value.toUpperCase();
      r.pendingMedia = (['AUDIO', 'PHOTO'] as const).filter((media) => letters.includes(MEDIA_LETTER[media]));
    } else if (key === 'L' && value) {
      r.locationText = clip(value, SMS_LOCATION_MAX_CHARS);
    }
  }
  return r;
}
