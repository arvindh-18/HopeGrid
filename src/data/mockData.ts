// src/data/mockData.ts — demo world for mock mode (architecture.md §12). Same meaning as server/scripts/seed.ts.
// Only src/data/mockApi.ts may import this file (rules.md AR-12, AR-13).
import { DEMO_CENTER } from '../../shared/constants';
import type {
  AiSource, AssignmentStatus, Availability, Equipment, Extraction, IncidentStatus, IncidentType, MessageSender, Need,
  PriorityLevel, ProcessingStatus, Reason, ResourceCategory, Role, Skill, TranscriptStatus, Vehicle,
} from '../../shared/types';

// ---------- Row shapes of the in-memory "database" (mirror architecture.md §6, camelCase) ----------
export interface ProfileRow {
  id: string; name: string; email: string; role: Role; phone: string | null;
  skills: Skill[]; equipment: Equipment[]; vehicle: Vehicle; availability: Availability; lat: number | null; lng: number | null;
}
export interface IncidentRow {
  id: string; code: string; type: IncidentType; lat: number | null; lng: number | null; locationText: string | null;
  publicArea: string | null; people: number | null; vulnerable: boolean; trapped: boolean; medical: boolean; danger: boolean;
  needs: Need[]; summary: string | null; status: IncidentStatus; confidence: number; confidenceReasons: Reason[];
  priorityScore: number; priority: PriorityLevel; priorityReasons: Reason[]; priorityOverride: PriorityLevel | null;
  overrideReason: string | null; escalationRecommended: boolean; escalationReasons: Reason[]; escalatedAt: string | null;
  verifiedAt: string | null; onSiteAt: string | null; resolvedAt: string | null; rejectReason: string | null;
  possibleDuplicateOf: string | null; mergedInto: string | null; createdAt: string; updatedAt: string;
}
export interface ReportRow {
  id: string; code: string; pin: string; deviceId: string; incidentId: string | null; text: string;
  transcript: string | null; transcriptStatus: TranscriptStatus; lat: number | null; lng: number | null;
  locationText: string | null; people: number | null; needs: Need[]; phone: string | null; phoneVerified: boolean;
  /** Keys into the mock media store (IndexedDB), not the media itself. */
  photoKey: string | null; audioKey: string | null; audioSeconds: number | null;
  extraction: Extraction | null; aiSource: AiSource | null; processingStatus: ProcessingStatus;
  createdAt: string; receivedAt: string;
}
export interface AssignmentRow {
  id: string; incidentId: string; volunteerId: string; status: AssignmentStatus; reason: string | null; createdAt: string; updatedAt: string;
}
export interface MessageRow {
  id: string; incidentId: string; reportId: string; assignmentId: string; sender: MessageSender; text: string | null;
  audioKey: string | null; lat: number | null; lng: number | null; createdAt: string;
}
export interface ResourceRow { id: string; name: string; category: ResourceCategory; quantity: number; unit: string; locationText: string }
export interface AllocationRow { id: string; resourceId: string; incidentId: string; quantity: number; createdAt: string }
export interface LogRow { id: string; incidentId: string; text: string; public: boolean; createdAt: string }

export interface MockDb {
  version: number;
  profiles: ProfileRow[];
  incidents: IncidentRow[];
  reports: ReportRow[];
  assignments: AssignmentRow[];
  messages: MessageRow[];
  resources: ResourceRow[];
  allocations: AllocationRow[];
  logs: LogRow[];
}

export const MOCK_DB_VERSION = 3;

/** Used for every voice note in mock mode (features.md F23). */
export const CANNED_TRANSCRIPT = 'Flood water has entered our house. My grandmother cannot walk and we are stuck upstairs.';

/** "Inject second report" demo action (architecture.md §12). */
export const SECOND_REPORT = {
  text: 'Several people are trapped near Central Street',
  deviceId: 'demo-device-victim-2',
  phone: '+91 98400 12345',
};

/** Accounts shown on the login screen in mock mode. Any password is accepted in mock mode. */
export const DEMO_ACCOUNTS = { admin: 'admin@demo.app', volunteer: 'ravi@demo.app', password: 'Demo@123' };

// Offsets: 0.009° lat ≈ 1 km; at 13°N, 0.00925° lng ≈ 1 km.
const at = (dLatKm: number, dLngKm: number) => ({ lat: DEMO_CENTER.lat + dLatKm * 0.009, lng: DEMO_CENTER.lng + dLngKm * 0.00925 });

const profiles: ProfileRow[] = [
  { id: 'u-admin', name: 'Coordinator', email: 'admin@demo.app', role: 'ADMIN', phone: null, skills: [], equipment: [], vehicle: 'NONE', availability: 'AVAILABLE', lat: null, lng: null },
  { id: 'u-ravi', name: 'Ravi', email: 'ravi@demo.app', role: 'VOLUNTEER', phone: '+91 90000 00001', skills: ['SWIMMING', 'FIRST_AID', 'SEARCH_RESCUE'], equipment: ['LIFE_JACKET', 'MEDICAL_KIT', 'ROPE'], vehicle: 'MOTORCYCLE', availability: 'AVAILABLE', ...at(0, 1.2) },
  { id: 'u-priya', name: 'Priya', email: 'priya@demo.app', role: 'VOLUNTEER', phone: '+91 90000 00002', skills: ['MEDICAL_PRO', 'FIRST_AID'], equipment: ['MEDICAL_KIT'], vehicle: 'CAR', availability: 'AVAILABLE', ...at(-2.5, 0) },
  { id: 'u-arun', name: 'Arun', email: 'arun@demo.app', role: 'VOLUNTEER', phone: '+91 90000 00003', skills: ['DRIVING', 'GENERAL'], equipment: [], vehicle: 'TRUCK', availability: 'AVAILABLE', ...at(0, -3) },
  { id: 'u-meena', name: 'Meena', email: 'meena@demo.app', role: 'VOLUNTEER', phone: '+91 90000 00004', skills: ['FIREFIGHTING'], equipment: ['FIRE_EXTINGUISHER'], vehicle: 'MOTORCYCLE', availability: 'BUSY', ...at(2, 0) },
  { id: 'u-karthik', name: 'Karthik', email: 'karthik@demo.app', role: 'VOLUNTEER', phone: '+91 90000 00005', skills: ['BOAT_HANDLING', 'SWIMMING'], equipment: ['BOAT', 'LIFE_JACKET'], vehicle: 'BOAT', availability: 'AVAILABLE', ...at(6, 0) },
];

const resources: ResourceRow[] = [
  { id: 'res-water', name: 'Drinking water', category: 'WATER', quantity: 200, unit: 'bottles', locationText: 'Community Center' },
  { id: 'res-food', name: 'Food packets', category: 'FOOD', quantity: 100, unit: 'packets', locationText: 'Community Center' },
  { id: 'res-kits', name: 'First aid kits', category: 'MEDICINE', quantity: 20, unit: 'kits', locationText: 'Primary Health Centre' },
  { id: 'res-blankets', name: 'Blankets', category: 'BLANKET', quantity: 80, unit: 'blankets', locationText: 'Community Center' },
  { id: 'res-gen', name: 'Generator', category: 'GENERATOR', quantity: 2, unit: 'units', locationText: 'Ward office' },
  { id: 'res-boat', name: 'Rescue boat', category: 'BOAT', quantity: 1, unit: 'boat', locationText: 'Lake jetty' },
  { id: 'res-shelter', name: 'Shelter space', category: 'SHELTER', quantity: 150, unit: 'people', locationText: 'Government school hall' },
];

function extraction(type: IncidentType, summary: string, extra: Partial<Extraction> = {}): Extraction {
  return { type, people: null, vulnerable: false, mobilityIssue: false, trapped: false, medical: false, danger: false, needs: [], places: [], summary, ...extra };
}

/**
 * Builds a fresh demo world relative to `now`. Scores are left at 0 here; mockApi recomputes every
 * incident with the real shared/ rules right after seeding, so fixtures never hold hand-made scores.
 */
export function buildSeed(now: Date = new Date()): MockDb {
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  const blank = {
    publicArea: null, confidence: 0, confidenceReasons: [], priorityScore: 0, priority: 'LOW' as PriorityLevel, priorityReasons: [],
    priorityOverride: null, overrideReason: null, escalationRecommended: false, escalationReasons: [], escalatedAt: null,
    onSiteAt: null, resolvedAt: null, rejectReason: null, possibleDuplicateOf: null, mergedInto: null,
  };
  const road = at(0.6, 0);
  const power = at(0, 0.9);
  const fire = at(-3, 0);

  const incidents: IncidentRow[] = [
    { ...blank, id: 'inc-road', code: 'RB4KT', type: 'ROAD_BLOCKED', ...road, locationText: 'Market Road, near the bus stop', publicArea: 'Market Road', people: 0, vulnerable: false, trapped: false, medical: false, danger: false, needs: [], summary: 'Tree fallen, road blocked', status: 'VERIFIED', verifiedAt: ago(25), createdAt: ago(30), updatedAt: ago(25) },
    { ...blank, id: 'inc-power', code: 'PW7NX', type: 'POWER_OUTAGE', ...power, locationText: 'Lake View Street', people: null, vulnerable: false, trapped: false, medical: false, danger: false, needs: [], summary: 'No electricity in whole street', status: 'NEW', verifiedAt: null, createdAt: ago(45), updatedAt: ago(40) },
    { ...blank, id: 'inc-fire', code: 'FR2QH', type: 'FIRE', ...fire, locationText: 'Temple Street, shop row', publicArea: 'Temple Street', people: 2, vulnerable: false, trapped: false, medical: false, danger: true, needs: [], summary: 'Small fire in a shop, contained', status: 'RESOLVED', verifiedAt: ago(170), onSiteAt: ago(160), resolvedAt: ago(120), createdAt: ago(180), updatedAt: ago(120) },
  ];

  const rep = (p: Partial<ReportRow> & Pick<ReportRow, 'id' | 'code' | 'pin' | 'deviceId' | 'incidentId' | 'text' | 'createdAt'>): ReportRow => ({
    transcript: null, transcriptStatus: 'NONE', lat: null, lng: null, locationText: null, people: null, needs: [], phone: null,
    phoneVerified: false, photoKey: null, audioKey: null, audioSeconds: null, extraction: null, aiSource: 'KEYWORDS',
    processingStatus: 'DONE', receivedAt: p.createdAt, ...p,
  });

  const reports: ReportRow[] = [
    rep({ id: 'rep-road-1', code: 'RB7K2M', pin: '1111', deviceId: 'seed-dev-1', incidentId: 'inc-road', text: 'Tree fallen, road blocked near the bus stop on Market Road', ...road, people: 0, createdAt: ago(30), extraction: extraction('ROAD_BLOCKED', 'Tree fallen, road blocked', { places: ['the bus stop on Market Road'] }) }),
    rep({ id: 'rep-power-1', code: 'PW3H8C', pin: '2222', deviceId: 'seed-dev-2', incidentId: 'inc-power', text: 'No electricity in whole street since morning', ...power, createdAt: ago(45), extraction: extraction('POWER_OUTAGE', 'No electricity in whole street') }),
    rep({ id: 'rep-power-2', code: 'PW9R4D', pin: '3333', deviceId: 'seed-dev-3', incidentId: 'inc-power', text: 'Power cut on Lake View Street, transformer sparking', ...power, createdAt: ago(40), extraction: extraction('POWER_OUTAGE', 'Power cut, transformer sparking', { danger: true, places: ['Lake View Street'] }) }),
    rep({ id: 'rep-fire-1', code: 'FR6M2P', pin: '4444', deviceId: 'seed-dev-4', incidentId: 'inc-fire', text: 'Smoke coming from a shop on Temple Street', ...fire, people: 2, createdAt: ago(180), extraction: extraction('FIRE', 'Smoke coming from a shop', { people: 2, danger: true, places: ['Temple Street'] }) }),
  ];

  const assignments: AssignmentRow[] = [
    { id: 'asg-fire', incidentId: 'inc-fire', volunteerId: 'u-meena', status: 'DONE', reason: null, createdAt: ago(168), updatedAt: ago(125) },
  ];

  const log = (incidentId: string, text: string, pub: boolean, min: number): LogRow => ({ id: `log-${incidentId}-${min}-${pub ? 'p' : 'a'}`, incidentId, text, public: pub, createdAt: ago(min) });
  const logs: LogRow[] = [
    log('inc-road', 'Report received', true, 30), log('inc-road', 'Structured by keyword fallback (AI unavailable)', false, 30), log('inc-road', 'Verified by the coordination team', true, 25),
    log('inc-power', 'Report received', true, 45), log('inc-power', 'Merged #PW8ZZ into this incident', false, 40), log('inc-power', 'Another report about the same situation was added', true, 40),
    log('inc-fire', 'Report received', true, 180), log('inc-fire', 'Verified by the coordination team', true, 170), log('inc-fire', 'Volunteer Meena assigned', false, 168),
    log('inc-fire', 'Help has arrived', true, 160), log('inc-fire', 'The volunteer has completed their help', true, 125), log('inc-fire', 'This incident has been resolved', true, 120),
  ];

  return {
    version: MOCK_DB_VERSION,
    profiles: profiles.map((p) => ({ ...p })),
    incidents,
    reports,
    assignments,
    messages: [],
    resources: resources.map((r) => ({ ...r })),
    allocations: [],
    logs,
  };
}
