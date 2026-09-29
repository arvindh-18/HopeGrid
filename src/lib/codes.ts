// src/lib/codes.ts — identifiers generated on the phone (rules.md BR-01).
import { CODE_ALPHABET, PIN_LENGTH, REPORT_CODE_LENGTH } from '../../shared/constants';

function randomInts(n: number, max: number): number[] {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return [...buf].map((v) => v % max);
}

export function newReportCode(length: number = REPORT_CODE_LENGTH): string {
  return randomInts(length, CODE_ALPHABET.length).map((i) => CODE_ALPHABET[i]).join('');
}
export function newPin(): string {
  return randomInts(PIN_LENGTH, 10).join('');
}
export function newUuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
