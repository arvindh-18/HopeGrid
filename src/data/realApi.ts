// src/data/realApi.ts — Phase C implementation of the Api interface (fetch to /api/*).
// Every function is currently a stub that names its endpoint (architecture.md §8.2).
// Phase C task: replace each stub with a fetch call that sends `Authorization: Bearer ${getToken()}`
// on admin/volunteer routes, parses the error envelope into ApiError, and maps network failures to
// ApiError('NETWORK'). Pages and components must not change when this file is filled in.
import { ApiError } from '../../shared/types';
import type { Api } from './index';

function notConnected(endpoint: string): never {
  throw new ApiError('SERVER_ERROR', `The server is not connected yet (${endpoint}).`);
}

/** JSON request to /api. Parses the error envelope (§8.1) into ApiError; fetch failures → NETWORK. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', "You're offline or the server can't be reached.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(err?.code ?? 'SERVER_ERROR', err?.message ?? `The server returned an error (${res.status}).`);
  }
  return data as T;
}

export const realApi: Api = {
  async submitReport(sub) { return request('POST', '/reports', sub); },
  async track(_code, _pin) { return notConnected('POST /api/track'); },
  async verifyPhone(_code, _pin, _phone, _otp) { return notConnected('POST /api/track/verify-phone'); },
  async getVictimChat(_code, _pin) { return notConnected('POST /api/track/chat'); },
  async sendVictimMessage(_code, _pin, _msg) { return notConnected('POST /api/track/chat/send'); },
  async getPublicIncidents() { return notConnected('GET /api/public/incidents'); },
  async login(_email, _password) { return notConnected('POST /api/auth/login'); },
  async me() { return notConnected('GET /api/auth/me'); },
  async listIncidents() { return notConnected('GET /api/admin/incidents'); },
  async getIncident(_id) { return notConnected('GET /api/admin/incidents/:id'); },
  async editIncident(_id, _patch) { return notConnected('PATCH /api/admin/incidents/:id'); },
  async verifyIncident(_id, _publicArea) { return notConnected('POST /api/admin/incidents/:id/verify'); },
  async rejectIncident(_id, _reason) { return notConnected('POST /api/admin/incidents/:id/reject'); },
  async overridePriority(_id, _level, _reason) { return notConnected('POST /api/admin/incidents/:id/override'); },
  async escalateIncident(_id, _note) { return notConnected('POST /api/admin/incidents/:id/escalate'); },
  async resolveIncident(_id, _note) { return notConnected('POST /api/admin/incidents/:id/resolve'); },
  async mergeIncident(_id, _intoId) { return notConnected('POST /api/admin/incidents/:id/merge'); },
  async dismissDuplicate(_id) { return notConnected('POST /api/admin/incidents/:id/dismiss-duplicate'); },
  async assignVolunteer(_id, _volunteerId) { return notConnected('POST /api/admin/incidents/:id/assign'); },
  async cancelAssignment(_assignmentId) { return notConnected('POST /api/admin/assignments/:id/cancel'); },
  async allocateResource(_id, _resourceId, _quantity) { return notConnected('POST /api/admin/incidents/:id/allocate'); },
  async listResources() { return notConnected('GET /api/admin/resources'); },
  async createResource(_r) { return notConnected('POST /api/admin/resources'); },
  async updateResource(_id, _patch) { return notConnected('PATCH /api/admin/resources/:id'); },
  async getMyProfile() { return notConnected('GET /api/volunteer/me'); },
  async updateMyProfile(_patch) { return notConnected('PATCH /api/volunteer/me'); },
  async listMyAssignments() { return notConnected('GET /api/volunteer/assignments'); },
  async updateAssignmentStatus(_id, _status, _reason) { return notConnected('POST /api/volunteer/assignments/:id/status'); },
  async getAssignmentChat(_id) { return notConnected('GET /api/volunteer/assignments/:id/chat'); },
  async sendVolunteerMessage(_id, _reportId, _msg) { return notConnected('POST /api/volunteer/assignments/:id/chat'); },
  async resetDemo() { return notConnected('POST /api/dev/reset'); },
};
