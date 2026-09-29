import { describe, expect, it } from 'vitest';
import { keywordExtractor } from '../shared/keywordExtractor';
import { computeConfidence, computeEscalation, computePriority, confidenceBand } from '../shared/scoring';
import { compatibleTypes, findDuplicate, findRelated, mergeFields, type LinkIncident, type MergeableIncident } from '../shared/linking';
import { rankVolunteers, type MatchVolunteer } from '../shared/volunteerMatch';
import { isPublic, markerColor, toPublicIncident } from '../shared/publicView';
import { victimStep } from '../shared/trackingStatus';
import { DEMO_CENTER } from '../shared/constants';

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
  it('hides low-confidence NEW incidents', () => {
    expect(isPublic(src, now)).toBe(false);
    expect(isPublic({ ...src, confidence: 60 }, now)).toBe(true);
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

describe('BR-90 victim step', () => {
  const inc = { status: 'IN_PROGRESS' as const, verifiedAt: minsAgo(5) };
  it('maps states', () => {
    expect(victimStep({ processingStatus: 'PENDING', incident: null, assignments: [] })).toBe('RECEIVED');
    expect(victimStep({ processingStatus: 'DONE', incident: { status: 'NEW', verifiedAt: null }, assignments: [] })).toBe('REVIEWING');
    expect(victimStep({ processingStatus: 'DONE', incident: inc, assignments: [{ status: 'EN_ROUTE' }] })).toBe('ON_THE_WAY');
    expect(victimStep({ processingStatus: 'DONE', incident: inc, assignments: [{ status: 'DONE' }] })).toBe('ARRIVED');
    expect(victimStep({ processingStatus: 'DONE', incident: { status: 'REJECTED', verifiedAt: null }, assignments: [] })).toBe('CLOSED');
  });
});
