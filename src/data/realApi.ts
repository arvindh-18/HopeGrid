// src/data/realApi.ts — implementation of the Api interface with fetch to /api/* (architecture.md §8).
// Sends the staff bearer token, parses the error envelope (§8.1) into ApiError, and maps network failures
// (and the Demo menu's "Simulate offline") to ApiError('NETWORK'). Pages never import this file (AR-12).
import { ApiError } from '../../shared/types';
import { isOnline } from '../offline/useOnline';
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
};
