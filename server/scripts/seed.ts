// server/scripts/seed.ts — demo world (architecture.md §12). Deletes all rows + storage objects, creates the staff
// auth users if missing, inserts seed data and recomputes scores with the real shared/ rules.
// Run: `npm run seed`. Also used by POST /api/dev/reset (F23).
import { pathToFileURL } from 'node:url';
import { DEMO_ADMIN_EMAIL, DEMO_CENTER, DEMO_PASSWORD, DEMO_VOLUNTEER_EMAIL } from '../../shared/constants';
import { keywordExtractor } from '../../shared/keywordExtractor';
import type {
  Availability, Equipment, IncidentRecord, ReportRecord, ResourceInput, Role, Skill, Vehicle,
} from '../../shared/types';
import { toRow } from '../mappers';
import { recomputeIncident } from '../pipeline';
import { removeFolder } from '../storage';
import { db } from '../supabase';

// 0.009° lat ≈ 1 km; at 13°N, 0.00925° lng ≈ 1 km.
const at = (northKm: number, eastKm: number) => ({ lat: DEMO_CENTER.lat + northKm * 0.009, lng: DEMO_CENTER.lng + eastKm * 0.00925 });

interface Staff {
  email: string; name: string; role: Role; skills: Skill[]; equipment: Equipment[]; vehicle: Vehicle;
  availability: Availability; lat: number | null; lng: number | null;
}
const STAFF: Staff[] = [
  { email: DEMO_ADMIN_EMAIL, name: 'Coordinator', role: 'ADMIN', skills: [], equipment: [], vehicle: 'NONE', availability: 'AVAILABLE', lat: null, lng: null },
  { email: DEMO_VOLUNTEER_EMAIL, name: 'Ravi', role: 'VOLUNTEER', skills: ['SWIMMING', 'FIRST_AID', 'SEARCH_RESCUE'], equipment: ['LIFE_JACKET', 'MEDICAL_KIT', 'ROPE'], vehicle: 'MOTORCYCLE', availability: 'AVAILABLE', ...at(0, 1.2) },
  { email: 'priya@demo.app', name: 'Priya', role: 'VOLUNTEER', skills: ['MEDICAL_PRO', 'FIRST_AID'], equipment: ['MEDICAL_KIT'], vehicle: 'CAR', availability: 'AVAILABLE', ...at(-2.5, 0) },
  { email: 'arun@demo.app', name: 'Arun', role: 'VOLUNTEER', skills: ['DRIVING', 'GENERAL'], equipment: [], vehicle: 'TRUCK', availability: 'AVAILABLE', ...at(0, -3) },
  { email: 'meena@demo.app', name: 'Meena', role: 'VOLUNTEER', skills: ['FIREFIGHTING'], equipment: ['FIRE_EXTINGUISHER'], vehicle: 'MOTORCYCLE', availability: 'BUSY', ...at(2, 0) },
  { email: 'karthik@demo.app', name: 'Karthik', role: 'VOLUNTEER', skills: ['BOAT_HANDLING', 'SWIMMING'], equipment: ['BOAT', 'LIFE_JACKET'], vehicle: 'BOAT', availability: 'AVAILABLE', ...at(6, 0) },
];

const RESOURCES: ResourceInput[] = [
  { name: 'Drinking water', category: 'WATER', quantity: 200, unit: 'bottles', locationText: 'Community Center' },
  { name: 'Food packets', category: 'FOOD', quantity: 100, unit: 'packets', locationText: 'Community Center' },
  { name: 'First aid kits', category: 'MEDICINE', quantity: 20, unit: 'kits', locationText: 'Primary Health Centre' },
  { name: 'Blankets', category: 'BLANKET', quantity: 80, unit: 'blankets', locationText: 'Community Center' },
  { name: 'Generator', category: 'GENERATOR', quantity: 2, unit: 'units', locationText: 'Ward office' },
  { name: 'Rescue boat', category: 'BOAT', quantity: 1, unit: 'boat', locationText: 'Lake jetty' },
  { name: 'Shelter space', category: 'SHELTER', quantity: 150, unit: 'people', locationText: 'Government school hall' },
];

async function must<T extends { error: { message: string } | null }>(p: PromiseLike<T>, what: string): Promise<T> {
  const r = await p;
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r;
}

async function wipe(): Promise<void> {
  const all = <Q extends { not: (c: string, op: string, v: null) => Q }>(q: Q) => q.not('id', 'is', null);
  for (const table of ['messages', 'allocations', 'incident_logs', 'help_offers', 'assignments', 'reports']) {
    await must(all(db.from(table).delete()), `Clearing ${table}`);
  }
  await must(all(db.from('incidents').update({ possible_duplicate_of: null, merged_into: null })), 'Clearing incident links');
  for (const table of ['incidents', 'resources', 'profiles']) await must(all(db.from(table).delete()), `Clearing ${table}`);
  await removeFolder('reports');
  await removeFolder('messages');
}

/** Auth user id for each staff email, creating missing users with the demo password. */
async function staffUserIds(): Promise<Map<string, string>> {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Listing auth users: ${error.message}`);
  const ids = new Map(data.users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u.id]));
  for (const s of STAFF) {
    if (ids.has(s.email)) continue;
    const created = await db.auth.admin.createUser({ email: s.email, password: DEMO_PASSWORD, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`Creating ${s.email}: ${created.error?.message}`);
    ids.set(s.email, created.data.user.id);
  }
  return ids;
}

export async function runSeed(now: Date = new Date()): Promise<void> {
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  await wipe();

  const ids = await staffUserIds();
  await must(db.from('profiles').insert(STAFF.map(({ email, ...s }) => toRow({ ...s, email, id: ids.get(email) }))), 'Inserting profiles');
  await must(db.from('resources').insert(RESOURCES.map((r) => toRow(r))), 'Inserting resources');

  // Background incidents, each with one report (§12). The demo flood is created live, not seeded.
  type Seed = { incident: Partial<IncidentRecord>; report: Partial<ReportRecord>; logs: [string, boolean, number][] };
  const road = at(0.6, 0);
  const power = at(0, 0.9);
  const fire = at(-3, 0);
  const seeds: Seed[] = [
    {
      incident: { code: 'RB4KT', type: 'ROAD_BLOCKED', ...road, locationText: 'Market Road, near the bus stop', publicArea: 'Market Road', people: 0, summary: 'Tree fallen, road blocked', status: 'VERIFIED', verifiedAt: ago(25), createdAt: ago(30), updatedAt: ago(25) },
      report: { code: 'RB7K2M', pin: '1111', deviceId: 'seed-device-1', text: 'Tree fallen, road blocked near the bus stop on Market Road', ...road, people: 0, createdAt: ago(30) },
      logs: [['Report received', true, 30], ['Structured by keyword fallback (AI unavailable)', false, 30], ['Verified by the coordination team', true, 25]],
    },
    {
      incident: { code: 'PW7NX', type: 'POWER_OUTAGE', ...power, locationText: 'Lake View Street', people: null, summary: 'No electricity in whole street', status: 'NEW', createdAt: ago(45), updatedAt: ago(45) },
      report: { code: 'PW3H8C', pin: '2222', deviceId: 'seed-device-2', text: 'No electricity in whole street since morning', ...power, locationText: 'Lake View Street', createdAt: ago(45) },
      logs: [['Report received', true, 45], ['Structured by keyword fallback (AI unavailable)', false, 45]],
    },
    {
      incident: { code: 'FR2QH', type: 'FIRE', ...fire, locationText: 'Temple Street, shop row', publicArea: 'Temple Street', people: 2, danger: true, summary: 'Small fire in a shop, contained', status: 'RESOLVED', verifiedAt: ago(170), resolvedAt: ago(120), createdAt: ago(180), updatedAt: ago(120) },
      report: { code: 'FR6M2P', pin: '4444', deviceId: 'seed-device-3', text: 'Smoke coming from a shop on Temple Street', ...fire, people: 2, createdAt: ago(180) },
      logs: [['Report received', true, 180], ['Structured by keyword fallback (AI unavailable)', false, 180], ['Verified by the coordination team', true, 170], ['This incident has been resolved', true, 120]],
    },
  ];

  for (const s of seeds) {
    const { data: row } = await must(db.from('incidents').insert(toRow(s.incident)).select('id').single(), `Inserting incident ${s.incident.code}`);
    const incidentId = row!.id as string;
    await must(db.from('reports').insert(toRow({
      ...s.report, id: crypto.randomUUID(), incidentId: incidentId, receivedAt: s.report.createdAt,
      extraction: keywordExtractor(s.report.text ?? ''), aiSource: 'KEYWORDS', processingStatus: 'DONE',
    })), `Inserting report ${s.report.code}`);
    await must(db.from('incident_logs').insert(s.logs.map(([text, pub, min]) => ({ incident_id: incidentId, text, public: pub, created_at: ago(min) }))), 'Inserting logs');
    await recomputeIncident(incidentId);
    // recompute bumps updated_at; keep the seeded "last updated" time.
    await must(db.from('incidents').update({ updated_at: s.incident.updatedAt }).eq('id', incidentId), 'Restoring updated_at');
  }
}

// `npm run seed`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSeed()
    .then(() => { console.log('Seed complete.'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
