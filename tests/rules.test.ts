import { describe, expect, it } from 'vitest';
import { chooseType, keywordExtractor } from '../shared/keywordExtractor';
import { computeConfidence, computeEscalation, computePriority, confidenceBand } from '../shared/scoring';
import { compatibleTypes, findDuplicate, findRelated, laterFacts, mergeFields, type LaterFactsIncident, type LinkIncident, type MergeableIncident } from '../shared/linking';
import { rankVolunteers, type MatchVolunteer } from '../shared/volunteerMatch';
import { isPublic, markerColor, toPublicIncident, withinRadius } from '../shared/publicView';
import { victimStep } from '../shared/trackingStatus';
import { encodeSmsReport, parseSmsReport } from '../shared/sms';
import {
  checkDispatchSettings, expiredOffers, incidentsToDispatch, parseVolunteerReply, sosPush, sosSms, sosSummary, waitingIncidents,
} from '../shared/dispatch';
import { humanize } from '../shared/volunteerMatch';
import { DEMO_CENTER, SMS_LOCATION_MAX_CHARS, SMS_TEXT_MAX_CHARS } from '../shared/constants';
import type { Extraction } from '../shared/types';

const now = new Date('2026-09-24T10:00:00Z');
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

describe('BR-10 keyword extractor', () => {
  it('demo sentence 1', () => {
    const e = keywordExtractor('Water has entered our house. My grandmother cannot walk and we are stuck on the second floor. The road outside is completely flooded.');
    expect(e.type).toBe('FLOOD');
    expect(e.vulnerable).toBe(true);
    expect(e.mobilityIssue).toBe(true);
    expect(e.trapped).toBe(true);
    expect(e.danger).toBe(true);
    expect(e.needs).toContain('EVACUATION');
    expect(e.needs).toContain('PHYSICAL_HELP');
  });
  it('demo sentence 2', () => {
    const e = keywordExtractor('Several people are trapped near Central Street');
    expect(e.type).toBe('PEOPLE_TRAPPED');
    expect(e.people).toBe(3);
    expect(e.places).toContain('Central Street');
  });
  it('does not confuse "three" with Tamil "thee" (fire)', () => {
    expect(keywordExtractor('three people need food').type).toBe('OTHER');
    expect(keywordExtractor('three people need food').needs).toContain('FOOD_WATER');
  });
  it('parses digits', () => {
    expect(keywordExtractor('we are 4 in the building').people).toBe(4);
    expect(keywordExtractor('family of 900').people).toBeNull();
  });

  it('understands Hindi (Devanagari) reports', () => {
    const e = keywordExtractor('हमारे घर में बाढ़ का पानी घुस गया है। मेरी दादी चल नहीं सकती, हम चार लोग छत पर फंसे हैं। मंदिर के पास हैं, बचाओ!');
    expect(e.type).toBe('FLOOD');
    expect(e.people).toBe(4);
    expect(e).toMatchObject({ vulnerable: true, mobilityIssue: true, trapped: true });
    expect(e.needs).toEqual(expect.arrayContaining(['EVACUATION', 'RESCUE', 'PHYSICAL_HELP']));
    expect(e.places).toContain('मंदिर');
  });
  it('understands Hinglish and matches Hindi words whole', () => {
    expect(keywordExtractor('ghar mein aag lagi hai, 3 log andar hain').type).toBe('FIRE');
    expect(keywordExtractor('ghar mein aag lagi hai, 3 log andar hain').people).toBe(3);
    expect(keywordExtractor('आगे सड़क बंद है').type).toBe('ROAD_BLOCKED'); // आगे ("ahead") is not आग ("fire")
    expect(keywordExtractor('बाढ़'.normalize('NFD')).type).toBe('FLOOD'); // nukta typed as a separate mark
  });
});

describe('BR-11a incident type: keyword rules first, then the AI', () => {
  it('uses the keyword type when the keyword rules find one', () => {
    expect(chooseType('HEAVY_RAIN', 'POWER_OUTAGE')).toBe('POWER_OUTAGE');
    expect(chooseType('HEAVY_RAIN', keywordExtractor('No electricity in our street since morning').type)).toBe('POWER_OUTAGE');
  });
  it("keeps the AI's type when the keyword rules find nothing", () => {
    expect(keywordExtractor('My mother has high fever and cannot breathe properly').type).toBe('OTHER');
    expect(chooseType('MEDICAL', 'OTHER')).toBe('MEDICAL');
  });
});

describe('BR-20 confidence', () => {
  it('1 report text only recent → 45 LOW', () => {
    const c = computeConfidence({ verifiedAt: null, onSiteAt: null }, [{ deviceId: 'a', hasPhoto: false, receivedAt: minsAgo(5), phoneVerified: false }], now);
    expect(c.score).toBe(45);
    expect(confidenceBand(c.score)).toBe('LOW');
  });
  it('2 devices + photo + recent + phone → 85 HIGH, verified → 99', () => {
    const reports = [
      { deviceId: 'a', hasPhoto: false, receivedAt: minsAgo(20), phoneVerified: false },
      { deviceId: 'b', hasPhoto: true, receivedAt: minsAgo(5), phoneVerified: true },
    ];
    expect(computeConfidence({ verifiedAt: null, onSiteAt: null }, reports, now).score).toBe(85);
    expect(computeConfidence({ verifiedAt: minsAgo(1), onSiteAt: null }, reports, now).score).toBe(99);
  });
  it('same device twice is not independent', () => {
    const reports = [
      { deviceId: 'a', hasPhoto: false, receivedAt: minsAgo(90), phoneVerified: false },
      { deviceId: 'a', hasPhoto: false, receivedAt: minsAgo(80), phoneVerified: false },
    ];
    expect(computeConfidence({ verifiedAt: null, onSiteAt: null }, reports, now).score).toBe(35);
  });
});

describe('BR-25 priority', () => {
  it('demo flood → 77 CRITICAL', () => {
    const p = computePriority({ type: 'FLOOD', people: 3, vulnerable: true, trapped: true, medical: false, danger: true });
    expect(p.score).toBe(77);
    expect(p.level).toBe('CRITICAL');
  });
  it('floor: trapped + medical is critical even with low score', () => {
    const p = computePriority({ type: 'OTHER', people: 0, vulnerable: false, trapped: true, medical: true, danger: false });
    expect(p.score).toBe(45);
    expect(p.level).toBe('CRITICAL');
  });
  it('road blocked alone is low', () => {
    expect(computePriority({ type: 'ROAD_BLOCKED', people: 0, vulnerable: false, trapped: false, medical: false, danger: false }).level).toBe('LOW');
  });
  it('escalation recommended for demo flood', () => {
    const e = computeEscalation({ type: 'FLOOD', people: 3, vulnerable: true, trapped: true, medical: false, danger: true, effectivePriority: 'CRITICAL' });
    expect(e.recommended).toBe(true);
  });
});

const link = (p: Partial<LinkIncident>): LinkIncident => ({
  id: 'x', code: 'X', type: 'FLOOD', status: 'NEW', lat: DEMO_CENTER.lat, lng: DEMO_CENTER.lng,
  createdAt: minsAgo(10), places: [], text: '', possibleDuplicateOf: null, ...p,
});

describe('BR-40 duplicates & BR-45 related', () => {
  it('situation types are compatible', () => {
    expect(compatibleTypes('FLOOD', 'PEOPLE_TRAPPED')).toBe(true);
    expect(compatibleTypes('FLOOD', 'FIRE')).toBe(false);
  });
  it('finds a close duplicate', () => {
    const a = link({ id: 'a', createdAt: minsAgo(30) });
    const b = link({ id: 'b', type: 'PEOPLE_TRAPPED' });
    expect(findDuplicate(b, [a, b])?.id).toBe('a');
  });
  it('ignores far or incompatible incidents', () => {
    const a = link({ id: 'a', type: 'FIRE' });
    const c = link({ id: 'c', lat: DEMO_CENTER.lat + 0.01 });
    const b = link({ id: 'b' });
    expect(findDuplicate(b, [a, b, c])).toBeNull();
  });
  it('related: flood near road blocked', () => {
    const flood = link({ id: 'f' });
    const road = link({ id: 'r', code: 'R', type: 'ROAD_BLOCKED', lat: DEMO_CENTER.lat + 0.005, createdAt: minsAgo(40) });
    const rel = findRelated(flood, [flood, road], (t) => t);
    expect(rel).toHaveLength(1);
    expect(rel[0].text).toContain('min earlier');
  });
});

describe('BR-50 merge fields', () => {
  const base: MergeableIncident = {
    type: 'FLOOD', status: 'NEW', people: null, vulnerable: true, trapped: true, medical: false, danger: true, needs: ['EVACUATION'],
    lat: 1, lng: 2, locationText: null, publicArea: null, summary: 'a', verifiedAt: null, escalatedAt: null, onSiteAt: null,
    priorityOverride: null, overrideReason: null,
  };
  it('takes max people, unions needs, keeps hazard type', () => {
    const m = mergeFields(base, { ...base, type: 'PEOPLE_TRAPPED', people: 3, needs: ['RESCUE'], vulnerable: false });
    expect(m.people).toBe(3);
    expect(m.needs).toEqual(['EVACUATION', 'RESCUE']);
    expect(m.type).toBe('FLOOD');
    expect(m.vulnerable).toBe(true);
  });
});

describe('BR-60 matching', () => {
  const vol = (p: Partial<MatchVolunteer>): MatchVolunteer => ({
    id: 'v', name: 'V', skills: [], equipment: [], vehicle: 'NONE', availability: 'AVAILABLE', lat: DEMO_CENTER.lat, lng: DEMO_CENTER.lng + 0.011, ...p,
  });
  const incident = { id: 'i', type: 'FLOOD' as const, trapped: true, medical: false, vulnerable: true, needs: ['EVACUATION' as const], lat: DEMO_CENTER.lat, lng: DEMO_CENTER.lng };
  it('Ravi ranks first with 100', () => {
    const ravi = vol({ id: 'ravi', name: 'Ravi', skills: ['SWIMMING', 'FIRST_AID', 'SEARCH_RESCUE'], equipment: ['LIFE_JACKET', 'MEDICAL_KIT', 'ROPE'] });
    const priya = vol({ id: 'priya', name: 'Priya', skills: ['MEDICAL_PRO', 'FIRST_AID'], equipment: ['MEDICAL_KIT'] });
    const busy = vol({ id: 'busy', availability: 'BUSY', skills: ['SWIMMING'] });
    const res = rankVolunteers(incident, [priya, ravi, busy], []);
    expect(res[0].volunteerId).toBe('ravi');
    expect(res[0].score).toBe(100);
    expect(res.find((r) => r.volunteerId === 'busy')).toBeUndefined();
  });
  it('excludes volunteers who declined this incident', () => {
    const ravi = vol({ id: 'ravi' });
    expect(rankVolunteers(incident, [ravi], [{ incidentId: 'i', volunteerId: 'ravi', status: 'DECLINED' }])).toHaveLength(0);
  });
});

describe('BR-80 public view', () => {
  const src = {
    code: 'ABCDE', type: 'FLOOD' as const, status: 'NEW' as const, lat: 13.04051234, lng: 80.23371234, publicArea: 'Central Street',
    verifiedAt: null, resolvedAt: null, confidence: 45, effectivePriority: 'CRITICAL' as const, reportCount: 1, updatedAt: minsAgo(1),
  };
  it('hides every NEW incident until a coordinator acts on it, whatever its confidence', () => {
    expect(isPublic(src, now)).toBe(false);
    expect(isPublic({ ...src, confidence: 99, reportCount: 5 }, now)).toBe(false);
    expect(isPublic({ ...src, status: 'VERIFIED', verifiedAt: minsAgo(1) }, now)).toBe(true);
    expect(isPublic({ ...src, status: 'IN_PROGRESS' }, now)).toBe(true); // a volunteer was sent: a coordinator acted
  });
  it('keeps an auto-dispatched incident off the map until a coordinator verifies it or the volunteer arrives (BR-165)', () => {
    const auto = { ...src, status: 'IN_PROGRESS' as const, autoDispatchedAt: minsAgo(5) };
    expect(isPublic(auto, now)).toBe(false);
    expect(isPublic({ ...auto, verifiedAt: minsAgo(1) }, now)).toBe(true);
    expect(isPublic({ ...auto, onSiteAt: minsAgo(1) }, now)).toBe(true);
  });
  it('shows RESOLVED incidents only for a few hours, and never REJECTED or MERGED ones', () => {
    expect(isPublic({ ...src, status: 'RESOLVED', resolvedAt: minsAgo(60) }, now)).toBe(true);
    expect(isPublic({ ...src, status: 'RESOLVED', resolvedAt: minsAgo(7 * 60) }, now)).toBe(false);
    expect(isPublic({ ...src, status: 'REJECTED', verifiedAt: minsAgo(5) }, now)).toBe(false);
    expect(isPublic({ ...src, status: 'MERGED', verifiedAt: minsAgo(5) }, now)).toBe(false);
  });
  it('never shows an incident without coordinates', () => {
    expect(isPublic({ ...src, status: 'VERIFIED', lat: null, lng: null }, now)).toBe(false);
  });
  it('never leaks area before verification and rounds coordinates', () => {
    const p = toPublicIncident({ ...src, confidence: 60 });
    expect(p.area).toBeNull();
    expect(p.lat).toBe(13.041);
    expect(Object.keys(p).sort()).toEqual(
      ['advice', 'area', 'code', 'color', 'confidenceBand', 'lat', 'lng', 'priority', 'reportCount', 'status', 'type', 'updatedAt', 'verified'].sort(),
    );
  });
  it('marker colours', () => {
    expect(markerColor('RESOLVED', 'CRITICAL', 'FLOOD')).toBe('GREEN');
    expect(markerColor('NEW', 'CRITICAL', 'FLOOD')).toBe('RED');
    expect(markerColor('NEW', 'LOW', 'ROAD_BLOCKED')).toBe('YELLOW');
    expect(markerColor('NEW', 'HIGH', 'FIRE')).toBe('ORANGE');
  });
});

describe('BR-85 map radius', () => {
  const kmNorth = (code: string, km: number) => toPublicIncident({
    code, type: 'FLOOD', status: 'VERIFIED', lat: DEMO_CENTER.lat + km / 111.2, lng: DEMO_CENTER.lng, publicArea: null,
    verifiedAt: minsAgo(5), resolvedAt: null, confidence: 65, effectivePriority: 'HIGH', reportCount: 1, updatedAt: minsAgo(1),
  });
  const list = [kmNorth('ONE', 1), kmNorth('FOUR', 4), kmNorth('EIGHT', 8)];
  const within = (m: number) => withinRadius(list, DEMO_CENTER.lat, DEMO_CENTER.lng, m);
  it('shows only the hazards within the chosen radius and counts the ones farther away', () => {
    expect(within(2000)).toEqual({ inside: [list[0]], fartherCount: 2 });
    expect(within(5000).inside.map((p) => p.code)).toEqual(['ONE', 'FOUR']);
    expect(within(10000)).toEqual({ inside: list, fartherCount: 0 });
  });
});

describe('BR-90 victim step', () => {
  const inc = { status: 'IN_PROGRESS' as const, verifiedAt: minsAgo(5) };
  it('maps states', () => {
    expect(victimStep({ incident: null, assignments: [] })).toBe('RECEIVED');
    expect(victimStep({ incident: { status: 'NEW', verifiedAt: null }, assignments: [] })).toBe('REVIEWING');
    expect(victimStep({ incident: inc, assignments: [{ status: 'EN_ROUTE' }] })).toBe('ON_THE_WAY');
    expect(victimStep({ incident: inc, assignments: [{ status: 'DONE' }] })).toBe('ARRIVED');
    expect(victimStep({ incident: { status: 'REJECTED', verifiedAt: null }, assignments: [] })).toBe('CLOSED');
  });
});

describe('BR-06 SMS format', () => {
  const report = {
    code: 'K7P2QX', pin: '4821', lat: 13.082712, lng: 80.270718, locationText: 'Near the\ntemple', people: 4,
    needs: ['MEDICAL', 'RESCUE'] as const, photoBase64: 'photo', audioBase64: 'audio', text: 'Water rising.\nGrandmother cannot walk',
  };
  const empty = { ...report, lat: null, lng: null, locationText: null, people: null, needs: [], photoBase64: null, audioBase64: null, text: '' };

  it('packs a report into one SMS and unpacks the same report', () => {
    const body = encodeSmsReport({ ...report, needs: [...report.needs] });
    expect(body).toBe('HG1 K7P2QX 4821\nG 13.08271 80.27072\nP 4\nN RM\nM AI\nL Near the temple\nT Water rising. Grandmother cannot walk');
    expect(parseSmsReport(body)).toEqual({
      code: 'K7P2QX', pin: '4821', lat: 13.08271, lng: 80.27072, locationText: 'Near the temple', people: 4,
      needs: ['RESCUE', 'MEDICAL'], pendingMedia: ['AUDIO', 'PHOTO'], text: 'Water rising. Grandmother cannot walk',
    });
  });

  it('leaves out what the report does not have, and shortens long text (the full text comes with the upload)', () => {
    expect(encodeSmsReport(empty)).toBe('HG1 K7P2QX 4821');
    const long = encodeSmsReport({ ...empty, text: 'water '.repeat(100), locationText: 'street '.repeat(40) }).split('\n');
    expect(long[1].startsWith('L ') && long[1].endsWith('…') && long[1].length).toBe(SMS_LOCATION_MAX_CHARS + 2);
    expect(long[2].startsWith('T ') && long[2].endsWith('…') && long[2].length).toBe(SMS_TEXT_MAX_CHARS + 2);
  });

  it('treats a message without a valid header as plain words', () => {
    expect(parseSmsReport('Water entered our house near the temple')).toBeNull();
    expect(parseSmsReport('HG1 K7P2Q 4821')).toBeNull(); // 5-character code
    expect(parseSmsReport('HG1 K7P2Q0 4821')).toBeNull(); // 0 is not in the code alphabet
    expect(parseSmsReport('HG1 K7P2QX 48')).toBeNull();
    expect(parseSmsReport('hg1 k7p2qx 4821')?.code).toBe('K7P2QX');
  });

  it('drops only the lines it cannot read, and keeps a multi-line description', () => {
    expect(parseSmsReport('HG1 K7P2QX 4821\nG 95 80\nP 9999\nN RZ\nX something new\nT line one\nline two')).toEqual({
      code: 'K7P2QX', pin: '4821', lat: null, lng: null, locationText: null, people: null, needs: ['RESCUE'], pendingMedia: [],
      text: 'line one\nline two',
    });
  });
});

describe('BR-07 later details only add facts', () => {
  const extraction = (over: Partial<Extraction> = {}): Extraction => ({
    type: 'OTHER', people: null, vulnerable: false, mobilityIssue: false, trapped: false, medical: false, danger: false,
    needs: [], places: [], summary: '', ...over,
  });
  const incident = (over: Partial<LaterFactsIncident> = {}): LaterFactsIncident => ({
    type: 'OTHER', people: null, vulnerable: false, trapped: false, medical: false, danger: false, needs: ['RESCUE'],
    locationText: null, summary: null, ...over,
  });

  it('fills what the SMS did not have: type, people, flags, needs, place, summary', () => {
    const { patch, added } = laterFacts(incident(), extraction({
      type: 'FLOOD', people: 3, mobilityIssue: true, trapped: true, needs: ['RESCUE', 'MEDICAL'], places: ['Canal Road'], summary: 'Flooded house',
    }), humanize);
    expect(patch).toEqual({
      type: 'FLOOD', people: 3, trapped: true, vulnerable: true, needs: ['RESCUE', 'MEDICAL'], locationText: 'Canal Road', summary: 'Flooded house',
    });
    expect(added).toEqual(['type Flood', '3 people', 'trapped', 'vulnerable', 'needs Medical', 'place Canal Road']);
  });

  it('never removes, lowers or replaces anything', () => {
    const full = incident({ type: 'FIRE', people: 5, vulnerable: true, trapped: true, medical: true, danger: true, locationText: 'Market Road', summary: 'Fire' });
    expect(laterFacts(full, extraction({ type: 'FLOOD', people: 2, places: ['Lake Road'], summary: 'Other' }), humanize)).toEqual({ patch: {}, added: [] });
    // A hazard type replaces a situation type (as in a merge, BR-50), and a larger count wins.
    expect(laterFacts(incident({ type: 'PEOPLE_TRAPPED', people: 2 }), extraction({ type: 'LANDSLIDE', people: 6 }), humanize).patch)
      .toEqual({ type: 'LANDSLIDE', people: 6 });
  });
});

describe('F28 auto-dispatch rules (BR-160…BR-164)', () => {
  it('checks the settings a coordinator sends (BR-160)', () => {
    expect(checkDispatchSettings({ mode: 'OVERLOAD', threshold: 5, responseMinutes: 3 })).toEqual({ mode: 'OVERLOAD', threshold: 5, responseMinutes: 3 });
    expect(typeof checkDispatchSettings({ mode: 'SOMETIMES', threshold: 5, responseMinutes: 3 })).toBe('string');
    expect(typeof checkDispatchSettings({ mode: 'ALWAYS', threshold: 0, responseMinutes: 3 })).toBe('string');
    expect(typeof checkDispatchSettings({ mode: 'ALWAYS', threshold: 2.5, responseMinutes: 3 })).toBe('string');
    expect(typeof checkDispatchSettings({ mode: 'ALWAYS', threshold: 5, responseMinutes: 31 })).toBe('string');
    expect(typeof checkDispatchSettings(null)).toBe('string');
  });

  const inc = (id: string, over: Record<string, unknown> = {}) => ({
    id, status: 'NEW' as const, priority: 'MEDIUM' as const, priorityOverride: null, escalationRecommended: false, escalatedAt: null,
    createdAt: minsAgo(10), ...over,
  }) as Parameters<typeof waitingIncidents>[0][number];

  it('lists waiting incidents most urgent first, like the dashboard (BR-160, BR-120)', () => {
    const list = [
      inc('old-medium', { createdAt: minsAgo(30) }),
      inc('new-medium'),
      inc('critical', { priority: 'CRITICAL' }),
      inc('overridden-high', { priority: 'LOW', priorityOverride: 'HIGH' }),
      inc('escalate', { escalationRecommended: true }),
      inc('verified', { status: 'VERIFIED', priority: 'LOW' }),
      inc('busy', { priority: 'CRITICAL' }),
      inc('in-progress', { status: 'IN_PROGRESS', priority: 'CRITICAL' }),
      inc('resolved', { status: 'RESOLVED', priority: 'CRITICAL' }),
    ];
    const asg = [{ incidentId: 'busy', status: 'ASSIGNED' as const }, { incidentId: 'old-medium', status: 'DECLINED' as const }];
    expect(waitingIncidents(list, asg).map((i) => i.id)).toEqual(['critical', 'overridden-high', 'escalate', 'old-medium', 'new-medium', 'verified']);
  });

  it('dispatches nothing when off, everything when always, and only above the threshold when overloaded (BR-161)', () => {
    const three = ['a', 'b', 'c'];
    expect(incidentsToDispatch({ mode: 'OFF', threshold: 1, responseMinutes: 3 }, three)).toEqual([]);
    expect(incidentsToDispatch({ mode: 'ALWAYS', threshold: 99, responseMinutes: 3 }, three)).toEqual(three);
    expect(incidentsToDispatch({ mode: 'OVERLOAD', threshold: 3, responseMinutes: 3 }, three)).toEqual([]);
    expect(incidentsToDispatch({ mode: 'OVERLOAD', threshold: 2, responseMinutes: 3 }, three)).toEqual(three);
  });

  it('expires only unanswered SOS offers past their deadline, never a coordinator\'s assignment (BR-162)', () => {
    const a = (id: string, over: Record<string, unknown>) => ({ id, status: 'ASSIGNED' as const, auto: true, respondBy: minsAgo(1), ...over });
    const list = [
      a('late', {}), a('in-time', { respondBy: new Date(now.getTime() + 60_000).toISOString() }),
      a('manual', { auto: false, respondBy: null }), a('manual-with-deadline', { auto: false }), a('accepted', { status: 'ACCEPTED' }),
    ];
    expect(expiredOffers(list as never[], now).map((x: { id: string }) => x.id)).toEqual(['late']);
  });

  it('reads a volunteer\'s YES / NO answer, with or without the incident code (BR-163)', () => {
    expect(parseVolunteerReply('yes')).toEqual({ answer: 'ACCEPT', code: null });
    expect(parseVolunteerReply(' Yes. ')).toEqual({ answer: 'ACCEPT', code: null });
    expect(parseVolunteerReply('YES WF22W')).toEqual({ answer: 'ACCEPT', code: 'WF22W' });
    expect(parseVolunteerReply('no #wf22w')).toEqual({ answer: 'DECLINE', code: 'WF22W' });
    expect(parseVolunteerReply('N')).toEqual({ answer: 'DECLINE', code: null });
    expect(parseVolunteerReply('yes please')).toBeNull();
    expect(parseVolunteerReply('YES WF22')).toBeNull(); // not a 5-character code
    expect(parseVolunteerReply('Water near Yes Street')).toBeNull();
  });

  it('writes a short SOS with the facts, the place and how to answer, and nothing about the reporter (BR-164)', () => {
    const i = { code: 'WF22W', type: 'FLOOD' as const, priority: 'CRITICAL' as const, people: 3, trapped: true, medical: false, vulnerable: true, locationText: 'Canal Road, near the temple' };
    const summary = sosSummary(i, '1.2 km', humanize);
    expect(summary).toBe('Flood, Critical priority, 3 people, trapped, vulnerable person at Canal Road, near the temple, 1.2 km away');
    expect(sosSms(i, summary, 3)).toBe(`HopeGrid SOS #WF22W: ${summary}. Reply YES WF22W to accept or NO WF22W to decline within 3 min.`);
    expect(sosPush(i, summary, 3)).toEqual({ title: 'SOS #WF22W: help needed', body: `${summary}. Accept or decline within 3 min.` });
  });
});
