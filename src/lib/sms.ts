// src/lib/sms.ts — SMS fallback on the phone (features.md F27). With no internet, S03 opens the phone's own SMS app
// with the report packed into one message (shared/sms.ts) for the HopeGrid number. An SMS needs only mobile signal,
// not mobile data, and the SMS app needs no permission from HopeGrid. The number is built in (VITE_SMS_NUMBER).

/** The HopeGrid gateway phone's number, or '' when this build has none (then the SMS option is hidden). */
export const SMS_NUMBER: string = (import.meta.env.VITE_SMS_NUMBER ?? '').replace(/[^\d+]/g, '');

/** An sms: link that opens the SMS app with `body` filled in. iOS reads the body after "&", Android after "?". */
export function smsHref(number: string, body: string): string {
  const separator = /iPad|iPhone|iPod/.test(navigator.userAgent) ? '&' : '?';
  return `sms:${number}${separator}body=${encodeURIComponent(body)}`;
}
