// shared/communityHelp.ts — people offering help from the public safety map (features.md F29, rules.md BR-170…BR-174).
// Split by trust: approved volunteers may take an incident nobody has yet; anyone else sends an offer a coordinator
// reviews, unless a coordinator opened the incident to anyone (then they join directly).
import { HELP_NAME_MAX, HELP_NOTE_MAX, PHONE_MAX_DIGITS, PHONE_MIN_DIGITS, PUBLIC_TASK_MAX } from './constants';
import { HELP_KINDS, type HelpKind, type HelpOfferInput, type PublicStatus } from './types';

const PHONE_RE = new RegExp(`^\\+?\\d{${PHONE_MIN_DIGITS},${PHONE_MAX_DIGITS}}$`);

/** BR-170: an offer from the public, checked. Returns the cleaned offer, or the reason it is refused. */
export function checkHelpOffer(input: unknown): HelpOfferInput | string {
  const b = (input ?? {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 2 || name.length > HELP_NAME_MAX) return `Enter your name (2–${HELP_NAME_MAX} characters).`;
  const phone = typeof b.phone === 'string' ? b.phone.replace(/[\s()-]/g, '') : '';
  if (!PHONE_RE.test(phone)) return `Enter a phone number of ${PHONE_MIN_DIGITS}–${PHONE_MAX_DIGITS} digits, optionally starting with +.`;
  if (!Array.isArray(b.kinds) || !b.kinds.every((k) => (HELP_KINDS as readonly unknown[]).includes(k))) return 'Choose what you can help with.';
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null;
  if (note && note.length > HELP_NOTE_MAX) return `Keep the note under ${HELP_NOTE_MAX} characters.`;
  if (typeof b.deviceId !== 'string' || !b.deviceId.trim()) return 'Device id is missing.';
  return { name, phone, kinds: [...new Set(b.kinds as HelpKind[])], note, deviceId: b.deviceId };
}

/** BR-172: a coordinator's task text for an incident opened to anyone. */
export function checkPublicTask(input: unknown): string | null {
  const task = typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : '';
  return task.length >= 5 && task.length <= PUBLIC_TASK_MAX ? task : null;
}

/**
 * BR-171: what someone looking at a hazard on the public map can do. `take`: an approved volunteer may go (no one has
 * it yet). `offer`: anyone may offer help for a coordinator to review. `join`: anyone may join directly, because a
 * coordinator opened it to anyone. Nothing on a resolved hazard.
 */
export function helpOptions(p: { status: PublicStatus; helpArranged: boolean; openToAll: boolean }, isVolunteer: boolean): { take: boolean; offer: boolean; join: boolean } {
  const open = p.status !== 'RESOLVED';
  return {
    take: isVolunteer && open && !p.helpArranged,
    offer: !isVolunteer && open && !p.helpArranged && !p.openToAll,
    join: !isVolunteer && open && p.openToAll,
  };
}
