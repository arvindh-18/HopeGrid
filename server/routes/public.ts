// server/routes/public.ts — community hazard map data (F19). Only toPublicIncident() output leaves here (AR-22).
import { Router } from 'express';
import { isPublic, toPublicIncident } from '../../shared/publicView';
import { effectivePriority } from '../../shared/scoring';
import type { IncidentRecord } from '../../shared/types';
import { fromRows } from '../mappers';
import { db } from '../supabase';

export const publicRouter = Router();

// GET /api/public/incidents → {generatedAt, incidents: PublicIncident[]}
publicRouter.get('/public/incidents', async (_req, res) => {
  const { data, error } = await db.from('incidents').select('*').in('status', ['NEW', 'VERIFIED', 'IN_PROGRESS', 'RESOLVED']);
  if (error) throw new Error(`Incident lookup failed: ${error.message}`);
  const incidents = fromRows<IncidentRecord>(data);
  const counts = new Map<string, number>();
  if (incidents.length) {
    const { data: reps, error: repError } = await db.from('reports').select('incident_id').in('incident_id', incidents.map((i) => i.id));
    if (repError) throw new Error(`Report lookup failed: ${repError.message}`);
    for (const r of reps) counts.set(r.incident_id, (counts.get(r.incident_id) ?? 0) + 1);
  }
  const now = new Date();
  res.json({
    generatedAt: now.toISOString(),
    incidents: incidents
      .map((i) => ({ ...i, effectivePriority: effectivePriority(i.priority, i.priorityOverride), reportCount: counts.get(i.id) ?? 0 }))
      .filter((i) => isPublic(i, now))
      .map(toPublicIncident),
  });
});
