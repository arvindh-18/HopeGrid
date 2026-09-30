// server/routes/messages.ts — private volunteer ↔ victim chat (F17, rules.md BR-70…BR-73).
// Responses never contain names, emails or phone numbers (AR-23).
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { MAX_AUDIO_BASE64 } from '../../shared/constants';
import {
  ApiError, CHAT_OPEN_ASSIGNMENT,
  type AssignmentRecord, type ChatMessage, type ChatThread, type MessageRecord, type MessageSender, type OutgoingMessage,
} from '../../shared/types';
import { currentUser, requireRole } from '../auth';
import { fromRow, fromRows, toRow } from '../mappers';
import { assignmentsOf, isUuid, reportsOf } from '../pipeline';
import { emitChange } from '../events';
import { signedUrls, uploadBase64 } from '../storage';
import { db } from '../supabase';
import { AUDIO_EXT_RE, isAudioBase64, victimReport } from './victim';

export const messagesRouter = Router();

const LOCATION_TEXT = '📍 Shared location';

/** Messages → API shape with signed audio URLs. */
export async function toChatMessages(rows: MessageRecord[]): Promise<ChatMessage[]> {
  const urls = await signedUrls(rows.map((m) => m.audioPath));
  return rows.map((m) => ({
    id: m.id, sender: m.sender, text: m.text, audioUrl: m.audioPath ? urls.get(m.audioPath) ?? null : null,
    lat: m.lat, lng: m.lng, createdAt: m.createdAt,
  }));
}

export async function messagesWhere(column: 'report_id' | 'incident_id' | 'assignment_id', value: string): Promise<MessageRecord[]> {
  const { data, error } = await db.from('messages').select('*').eq(column, value).order('created_at');
  if (error) throw new Error(`Message lookup failed: ${error.message}`);
  return fromRows<MessageRecord>(data);
}

/** Validate, upload optional audio, insert. `allowLocation` only for victims ("Share my location"). */
async function createMessage(
  base: { incidentId: string; reportId: string; assignmentId: string; sender: MessageSender },
  msg: OutgoingMessage,
  allowLocation: boolean,
): Promise<ChatMessage> {
  const text = typeof msg.text === 'string' ? msg.text.trim() : '';
  const hasAudio = typeof msg.audioBase64 === 'string' && msg.audioBase64.length > 0;
  const hasLocation = allowLocation && msg.lat !== undefined && msg.lat !== null;
  if (hasLocation && !(typeof msg.lat === 'number' && Math.abs(msg.lat) <= 90 && typeof msg.lng === 'number' && Math.abs(msg.lng) <= 180)) {
    throw new ApiError('VALIDATION', 'Location is invalid.');
  }
  if (!text && !hasAudio && !hasLocation) throw new ApiError('VALIDATION', 'Type a message first.');
  if (hasAudio && msg.audioBase64!.length > MAX_AUDIO_BASE64) throw new ApiError('VALIDATION', 'Voice message is too long.');
  if (hasAudio && !AUDIO_EXT_RE.test(msg.audioMime ?? '')) throw new ApiError('VALIDATION', 'Voice message format is not supported.');
  if (hasAudio && !isAudioBase64(msg.audioBase64!, msg.audioMime!)) throw new ApiError('VALIDATION', 'Voice message is not a valid recording.');

  const id = randomUUID();
  let audioPath: string | null = null;
  if (hasAudio) {
    audioPath = `messages/${id}.${AUDIO_EXT_RE.exec(msg.audioMime!)![1]}`;
    await uploadBase64(audioPath, msg.audioBase64!, msg.audioMime!);
  }
  const record: MessageRecord = {
    ...base, id, audioPath,
    text: hasLocation ? LOCATION_TEXT : text || null,
    lat: hasLocation ? msg.lat! : null,
    lng: hasLocation ? msg.lng! : null,
    createdAt: new Date().toISOString(),
  };
  const { data, error } = await db.from('messages').insert(toRow(record)).select('*').single();
  if (error) throw new Error(`Message insert failed: ${error.message}`);
  emitChange({ incidentId: base.incidentId, reportId: base.reportId });
  return (await toChatMessages([fromRow<MessageRecord>(data)]))[0];
}

const chatAssignment = (assignments: AssignmentRecord[]) => assignments.find((a) => CHAT_OPEN_ASSIGNMENT.includes(a.status)) ?? null;

// ---------------------------------------------------------------- victim (code + PIN)

// POST /api/track/chat {code, pin} → {open, messages}
messagesRouter.post('/track/chat', async (req, res) => {
  const r = await victimReport(req.body);
  const open = r.incidentId ? chatAssignment(await assignmentsOf(r.incidentId)) !== null : false;
  res.json({ open, messages: await toChatMessages(await messagesWhere('report_id', r.id)) });
});

// POST /api/track/chat/send {code, pin, text?, audioBase64?, audioMime?, lat?, lng?} → ChatMessage
messagesRouter.post('/track/chat/send', async (req, res) => {
  const r = await victimReport(req.body);
  const a = r.incidentId ? chatAssignment(await assignmentsOf(r.incidentId)) : null;
  if (!r.incidentId || !a) throw new ApiError('CHAT_CLOSED', 'Chat is closed. It opens when a volunteer accepts your request.');
  const { text, audioBase64, audioMime, lat, lng } = req.body as OutgoingMessage;
  res.json(await createMessage(
    { incidentId: r.incidentId, reportId: r.id, assignmentId: a.id, sender: 'VICTIM' },
    { text, audioBase64, audioMime, lat, lng },
    true,
  ));
});

// ---------------------------------------------------------------- volunteer (own assignment only)

export async function ownAssignment(id: string, volunteerId: string): Promise<AssignmentRecord> {
  if (!isUuid(id)) throw new ApiError('NOT_FOUND', 'This assignment does not exist.');
  const { data, error } = await db.from('assignments').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Assignment lookup failed: ${error.message}`);
  if (!data) throw new ApiError('NOT_FOUND', 'This assignment does not exist.');
  const a = fromRow<AssignmentRecord>(data);
  if (a.volunteerId !== volunteerId) throw new ApiError('FORBIDDEN', 'This is not your assignment.');
  return a;
}

// GET /api/volunteer/assignments/:id/chat → {open, threads} (one thread per report, only this assignment's messages)
messagesRouter.get('/volunteer/assignments/:id/chat', requireRole('VOLUNTEER'), async (req, res) => {
  const a = await ownAssignment(String(req.params.id), currentUser(req).id);
  const [reports, messages] = await Promise.all([reportsOf(a.incidentId), messagesWhere('assignment_id', a.id)]);
  const all = await toChatMessages(messages);
  const threads: ChatThread[] = reports.map((r, n) => ({
    reportId: r.id,
    label: `Reporter ${n + 1}`,
    messages: all.filter((_, k) => messages[k].reportId === r.id),
  }));
  res.json({ open: CHAT_OPEN_ASSIGNMENT.includes(a.status), threads });
});

// POST /api/volunteer/assignments/:id/chat {reportId, text?, audioBase64?, audioMime?} → ChatMessage
messagesRouter.post('/volunteer/assignments/:id/chat', requireRole('VOLUNTEER'), async (req, res) => {
  const a = await ownAssignment(String(req.params.id), currentUser(req).id);
  if (!CHAT_OPEN_ASSIGNMENT.includes(a.status)) throw new ApiError('CHAT_CLOSED', 'Chat is closed for this assignment.');
  const { reportId, text, audioBase64, audioMime } = req.body ?? {};
  if (!isUuid(reportId)) throw new ApiError('FORBIDDEN', 'This reporter is not part of your assignment.');
  const { data, error } = await db.from('reports').select('incident_id').eq('id', reportId).maybeSingle();
  if (error) throw new Error(`Report lookup failed: ${error.message}`);
  if (!data || data.incident_id !== a.incidentId) throw new ApiError('FORBIDDEN', 'This reporter is not part of your assignment.');
  res.json(await createMessage(
    { incidentId: a.incidentId, reportId, assignmentId: a.id, sender: 'VOLUNTEER' },
    { text, audioBase64, audioMime },
    false,
  ));
});
