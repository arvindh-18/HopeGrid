// src/data/realApi.ts — implementation of the Api interface with fetch to /api/* (architecture.md §8).
// Sends the staff bearer token, parses the error envelope (§8.1) into ApiError, and maps network failures
// (and the Demo menu's "Simulate offline") to ApiError('NETWORK'). Pages never import this file (AR-12).
import { STREAM_RETRY_MAX_MS, STREAM_RETRY_MS } from '../../shared/constants';
import { ApiError } from '../../shared/types';
import { isOnline, subscribeOnline } from '../offline/useOnline';
import type { Api } from './index';
import { getToken } from './index';

const OFFLINE_MESSAGE = "You're offline or the server can't be reached.";

/** JSON request to /api. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!isOnline()) throw new ApiError('NETWORK', OFFLINE_MESSAGE);
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('NETWORK', OFFLINE_MESSAGE);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(err?.code ?? 'SERVER_ERROR', err?.message ?? `The server returned an error (${res.status}).`);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);
const id = encodeURIComponent;

export const realApi: Api = {
  // Victim
  submitReport: (sub) => post('/reports', sub),
  track: (code, pin) => post('/track', { code, pin }),
  verifyPhone: (code, pin, phone, otp) => post('/track/verify-phone', { code, pin, phone, otp }),
  getVictimChat: (code, pin) => post('/track/chat', { code, pin }),
  sendVictimMessage: (code, pin, msg) => post('/track/chat/send', { code, pin, ...msg }),
  // Public
  getPublicIncidents: () => get('/public/incidents'),
  // Auth
  login: (email, password) => post('/auth/login', { email, password }),
  me: () => get('/auth/me'),
  // Admin
  listIncidents: () => get('/admin/incidents'),
  getIncident: (incidentId) => get(`/admin/incidents/${id(incidentId)}`),
  editIncident: (incidentId, p) => patch(`/admin/incidents/${id(incidentId)}`, p),
  verifyIncident: (incidentId, publicArea) => post(`/admin/incidents/${id(incidentId)}/verify`, { publicArea }),
  rejectIncident: (incidentId, reason) => post(`/admin/incidents/${id(incidentId)}/reject`, { reason }),
  overridePriority: (incidentId, level, reason) => post(`/admin/incidents/${id(incidentId)}/override`, { level, reason }),
  escalateIncident: (incidentId, note) => post(`/admin/incidents/${id(incidentId)}/escalate`, { note }),
  resolveIncident: (incidentId, note) => post(`/admin/incidents/${id(incidentId)}/resolve`, { note }),
  mergeIncident: (incidentId, intoId) => post(`/admin/incidents/${id(incidentId)}/merge`, { intoId }),
  dismissDuplicate: (incidentId) => post(`/admin/incidents/${id(incidentId)}/dismiss-duplicate`),
  assignVolunteer: (incidentId, volunteerId) => post(`/admin/incidents/${id(incidentId)}/assign`, { volunteerId }),
  cancelAssignment: (assignmentId) => post(`/admin/assignments/${id(assignmentId)}/cancel`),
  allocateResource: (incidentId, resourceId, quantity) => post(`/admin/incidents/${id(incidentId)}/allocate`, { resourceId, quantity }),
  listResources: () => get('/admin/resources'),
  createResource: (r) => post('/admin/resources', r),
  updateResource: (resourceId, p) => patch(`/admin/resources/${id(resourceId)}`, p),
  // Volunteer
  getMyProfile: () => get('/volunteer/me'),
  updateMyProfile: (p) => patch('/volunteer/me', p),
  listMyAssignments: () => get('/volunteer/assignments'),
  updateAssignmentStatus: (assignmentId, status, reason) => post(`/volunteer/assignments/${id(assignmentId)}/status`, { status, reason }),
  getAssignmentChat: (assignmentId) => get(`/volunteer/assignments/${id(assignmentId)}/chat`),
  sendVolunteerMessage: (assignmentId, reportId, msg) => post(`/volunteer/assignments/${id(assignmentId)}/chat`, { reportId, ...msg }),
  // Dev
  resetDemo: () => post('/dev/reset'),
  // Live change signals
  watchAdmin: (onChange, onLive) => watch('GET', '/admin/events', undefined, {
    onChange: (d) => onChange(typeof d.incidentId === 'string' ? d.incidentId : null), onLive,
  }),
  watchVolunteer: (onChange, onLive) => watch('GET', '/volunteer/events', undefined, { onChange: () => onChange(), onLive }),
  watchTrack: (code, pin, onChange, onLive) => watch('POST', '/track/events', { code, pin }, { onChange: () => onChange(), onLive }),
};

// ---------- Live change signals (architecture D12) ----------
// Server-Sent Events read with fetch(), because EventSource can't send the Authorization header or a POST body.
// Subscribers of the same endpoint share one stream. It reconnects with a growing delay, and gives up for good on
// 401/403/404 (the screen then simply keeps polling). A stream counts as live only once bytes arrive, so a proxy
// that buffers it leaves the screen polling at its normal speed.
interface Listener { onChange: (data: Record<string, unknown>) => void; onLive?: (live: boolean) => void }
interface Stream { listeners: Set<Listener>; live: boolean; stop: () => void }
const streams = new Map<string, Stream>();

function watch(method: 'GET' | 'POST', path: string, body: unknown, listener: Listener): () => void {
  const key = `${method} ${path} ${JSON.stringify(body ?? null)}`;
  let stream = streams.get(key);
  if (!stream) {
    const created: Stream = { listeners: new Set(), live: false, stop: () => {} };
    created.stop = runStream(method, path, body, created);
    streams.set(key, created);
    stream = created;
  }
  const s = stream;
  s.listeners.add(listener);
  listener.onLive?.(s.live);
  return () => {
    s.listeners.delete(listener);
    if (s.listeners.size === 0) {
      s.stop();
      streams.delete(key);
    }
  };
}

function runStream(method: 'GET' | 'POST', path: string, body: unknown, s: Stream): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  const setLive = (live: boolean) => {
    if (s.live === live) return;
    s.live = live;
    s.listeners.forEach((l) => l.onLive?.(live));
  };
  // Going offline (or the Demo menu's "Simulate offline") drops the stream; the loop reconnects when back online.
  const unsubscribeOnline = subscribeOnline(() => { if (!isOnline()) controller?.abort(); });

  void (async () => {
    let delay = STREAM_RETRY_MS;
    while (!stopped) {
      if (isOnline()) {
        controller = new AbortController();
        try {
          const headers: Record<string, string> = { Accept: 'text/event-stream' };
          if (body !== undefined) headers['Content-Type'] = 'application/json';
          const token = getToken();
          if (token) headers.Authorization = `Bearer ${token}`;
          const res = await fetch(`/api${path}`, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
          });
          if (res.status === 401 || res.status === 403 || res.status === 404) break;
          if (!res.ok || !res.body) throw new Error(`Stream answered ${res.status}`);
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            setLive(true);
            delay = STREAM_RETRY_MS;
            buffer += value;
            let end: number;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const lines = buffer.slice(0, end).split('\n');
              buffer = buffer.slice(end + 2);
              if (!lines.includes('event: change')) continue; // ": connected" / ": ping" comments
              let data: Record<string, unknown> = {};
              try {
                const line = lines.find((l) => l.startsWith('data: '));
                if (line) data = JSON.parse(line.slice(6));
              } catch { /* an unreadable payload still means "something changed" */ }
              s.listeners.forEach((l) => l.onChange(data));
            }
          }
        } catch { /* network error, or stopped */ }
      }
      setLive(false);
      if (stopped) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, STREAM_RETRY_MAX_MS);
    }
    setLive(false);
  })();

  return () => {
    stopped = true;
    controller?.abort();
    unsubscribeOnline();
    setLive(false);
  };
}
