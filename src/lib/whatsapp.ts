// src/lib/whatsapp.ts — "Send on WhatsApp" for a new assignment (F14). Builds a wa.me click-to-chat link: WhatsApp opens
// on the coordinator's device with the volunteer's number and a ready message, and the coordinator presses Send.
// No WhatsApp account, API or cost. The message never contains the victim's name, phone or report text.

/** Digits for wa.me: country code + number, no "+" or spaces. A bare 10-digit number is taken as Indian (+91). */
export function waNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export interface AssignmentMessage {
  typeLabel: string;
  priorityLabel: string;
  incidentCode: string;
  area: string | null;
  /** Full link to the volunteer's assignment page, where they accept or decline. */
  url: string;
}

export function assignmentMessage(m: AssignmentMessage): string {
  return [
    `HopeGrid: you have been assigned a ${m.priorityLabel.toLowerCase()} priority ${m.typeLabel.toLowerCase()} incident (#${m.incidentCode})${m.area ? ` near ${m.area}` : ''}.`,
    `Please open this link to accept or decline: ${m.url}`,
  ].join('\n');
}

/** wa.me link, or null when the volunteer has no usable phone number. */
export function whatsappLink(phone: string | null | undefined, message: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}
