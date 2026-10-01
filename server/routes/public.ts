// server/routes/public.ts — community hazard map data (F19) and help offers from the map (F29). Only
// toPublicIncident() output leaves here (AR-22); an offer's answer carries only the coordinator's public task.
import { Router } from 'express';
import { checkHelpOffer } from '../../shared/communityHelp';
import { isPublic, toPublicIncident } from '../../shared/publicView';
import { effectivePriority } from '../../shared/scoring';
import { ApiError, type HelpOfferRecord, type HelpOfferResult, type IncidentRecord } from '../../shared/types';
import { fromRow, fromRows, toRow } from '../mappers';
import { addLog } from '../pipeline';
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

// POST /api/public/incidents/:code/help HelpOfferInput → HelpOfferResult (F29, BR-170, BR-171)
publicRouter.post('/public/incidents/:code/help', async (req, res) => {
  const { data, error } = await db.from('incidents').select('*').eq('code', String(req.params.code).toUpperCase()).maybeSingle();
  if (error) throw new Error(`Incident lookup failed: ${error.message}`);
  const i = data ? fromRow<IncidentRecord>(data) : null;
  const notOnMap = new ApiError('NOT_FOUND', 'This incident is not on the safety map.');
  if (!i) throw notOnMap;
  const { data: reps, error: repError } = await db.from('reports').select('id').eq('incident_id', i.id);
  if (repError) throw new Error(`Report lookup failed: ${repError.message}`);
  const src = { ...i, effectivePriority: effectivePriority(i.priority, i.priorityOverride), reportCount: reps.length };
  if (!isPublic(src)) throw notOnMap; // people can only offer help on what they can see
  if (i.status === 'RESOLVED') throw new ApiError('INVALID_STATE', 'This incident is already resolved. Thank you!');

  const offer = checkHelpOffer(req.body);
  if (typeof offer === 'string') throw new ApiError('VALIDATION', offer);
  const joining = !!i.openToAll;
  if (!joining && i.status === 'IN_PROGRESS') throw new ApiError('INVALID_STATE', 'A volunteer is already helping here. Thank you!');

  // One offer per phone and incident: a second tap or a resend changes nothing.
  const { data: mine, error: mineError } = await db.from('help_offers').select('*').eq('incident_id', i.id).eq('phone', offer.phone);
  if (mineError) throw new Error(`Help offer lookup failed: ${mineError.message}`);
  const earlier = fromRows<HelpOfferRecord>(mine).find((o) => o.status === (joining ? 'JOINED' : 'PENDING'));
  if (!earlier) {
    const status = joining ? 'JOINED' : 'PENDING';
    const { error: e } = await db.from('help_offers').insert(toRow({ incidentId: i.id, ...offer, status }));
    if (e) throw new Error(`Help offer insert failed: ${e.message}`);
    await addLog(i.id, joining ? `${offer.name} joined from the public map` : `${offer.name} offered to help from the public map`, false);
  }
  const result: HelpOfferResult = { ok: true, status: joining ? 'JOINED' : 'PENDING', task: joining ? i.publicTask ?? null : null };
  res.status(earlier ? 200 : 201).json(result);
});
