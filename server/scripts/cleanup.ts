// server/scripts/cleanup.ts — data retention (docs/scaling.md §5): deletes CLOSED incidents (RESOLVED, REJECTED,
// MERGED) not updated for N days, with everything that belongs to them, in foreign-key order (there are no
// ON DELETE CASCADE rules). Open incidents (NEW, VERIFIED, IN_PROGRESS), staff profiles and resources are never
// touched. Dry run by default: nothing is deleted without --apply.
// Usage: npx tsx server/scripts/cleanup.ts [--older-than-days 30] [--apply]
import { pathToFileURL } from 'node:url';
import { removeFiles } from '../storage';
import { db } from '../supabase';

const CLOSED = ['RESOLVED', 'REJECTED', 'MERGED'];
const DEFAULT_DAYS = 30;

type Row = Record<string, unknown>;
async function rows(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${error.message}`);
  return (data ?? []) as Row[];
}
const ids = (list: Row[]) => list.map((r) => r.id as string);

export interface CleanupPlan {
  cutoff: string;
  incidents: string[];
  reports: string[];
  assignments: string[];
  messages: string[];
  allocations: string[];
  logs: string[];
  helpOffers: string[]; // F29
  media: string[];
  /** Kept incidents whose possible_duplicate_of / merged_into point at a deleted one (set to null first). */
  unlink: { id: string; column: 'possible_duplicate_of' | 'merged_into' }[];
}

/** What would be deleted for incidents closed and untouched since `olderThanDays` days before `now`. Reads only. */
export async function planCleanup(olderThanDays: number, now = new Date()): Promise<CleanupPlan> {
  if (!Number.isFinite(olderThanDays) || olderThanDays < 1) throw new Error('older-than-days must be at least 1');
  const cutoff = new Date(now.getTime() - olderThanDays * 86_400_000).toISOString();
  const closed = await rows(db.from('incidents').select('id, updated_at').in('status', CLOSED), 'Incident lookup failed');
  const incidents = ids(closed.filter((i) => new Date(i.updated_at as string).toISOString() < cutoff));
  const empty: CleanupPlan = { cutoff, incidents, reports: [], assignments: [], messages: [], allocations: [], logs: [], helpOffers: [], media: [], unlink: [] };
  if (incidents.length === 0) return empty;

  const [reports, assignments, messages, allocations, logs, helpOffers, others] = await Promise.all([
    rows(db.from('reports').select('id, photo_path, audio_path').in('incident_id', incidents), 'Report lookup failed'),
    rows(db.from('assignments').select('id').in('incident_id', incidents), 'Assignment lookup failed'),
    rows(db.from('messages').select('id, audio_path').in('incident_id', incidents), 'Message lookup failed'),
    rows(db.from('allocations').select('id').in('incident_id', incidents), 'Allocation lookup failed'),
    rows(db.from('incident_logs').select('id').in('incident_id', incidents), 'Log lookup failed'),
    rows(db.from('help_offers').select('id').in('incident_id', incidents), 'Help offer lookup failed'),
    rows(db.from('incidents').select('id, possible_duplicate_of, merged_into'), 'Incident lookup failed'),
  ]);
  const doomed = new Set(incidents);
  const unlink: CleanupPlan['unlink'] = [];
  for (const o of others) {
    if (doomed.has(o.id as string)) continue;
    if (doomed.has(o.possible_duplicate_of as string)) unlink.push({ id: o.id as string, column: 'possible_duplicate_of' });
    if (doomed.has(o.merged_into as string)) unlink.push({ id: o.id as string, column: 'merged_into' });
  }
  const media = [...reports.flatMap((r) => [r.photo_path, r.audio_path]), ...messages.map((m) => m.audio_path)].filter((p): p is string => !!p);
  return {
    ...empty,
    reports: ids(reports), assignments: ids(assignments), messages: ids(messages), allocations: ids(allocations), logs: ids(logs),
    helpOffers: ids(helpOffers), media, unlink,
  };
}

/** Deletes a plan in foreign-key order: messages → assignments → allocations → logs → help offers → media → reports →
 * incidents. */
export async function applyCleanup(plan: CleanupPlan): Promise<void> {
  const del = async (table: string, list: string[]) => {
    for (let i = 0; i < list.length; i += 200) {
      const { error } = await db.from(table).delete().in('id', list.slice(i, i + 200));
      if (error) throw new Error(`Deleting from ${table} failed: ${error.message}`);
    }
  };
  await del('messages', plan.messages);
  await del('assignments', plan.assignments);
  await del('allocations', plan.allocations);
  await del('incident_logs', plan.logs);
  await del('help_offers', plan.helpOffers);
  await removeFiles(plan.media);
  await del('reports', plan.reports);
  for (const u of plan.unlink) {
    const { error } = await db.from('incidents').update({ [u.column]: null }).eq('id', u.id);
    if (error) throw new Error(`Unlinking incident ${u.id} failed: ${error.message}`);
  }
  await del('incidents', plan.incidents);
}

async function main() {
  const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
  const days = Number(arg('--older-than-days') ?? DEFAULT_DAYS);
  const plan = await planCleanup(days);
  const counts = Object.fromEntries(Object.entries(plan).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]));
  console.log(`Closed incidents not updated since ${plan.cutoff}:`, counts);
  if (!process.argv.includes('--apply')) {
    console.log('Dry run — nothing was deleted. Re-run with --apply to delete the rows and files listed above.');
    return;
  }
  await applyCleanup(plan);
  console.log('Deleted.');
}

// Run only when started directly (tests import the functions).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(() => process.exit(0), (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
