// src/data/index.ts — the ONLY data entry point for pages and components (rules.md AR-12).
// Backed by realApi (fetch /api/*).
import type {
  ChatMessage, ChatThread, IncidentDetail, IncidentListItem, IncidentPatch, OutgoingMessage, PriorityLevel,
  PublicIncident, ReportSubmission, Resource, ResourceInput, SessionUser, TrackView, UnableReason,
  AssignmentStatus, VolunteerAssignment, VolunteerProfile, VolunteerProfilePatch,
  ApplicationStatus, VolunteerApplication, VolunteerApplicationInput, VolunteerListItem, DispatchSettings, DispatchState,
  HelpOfferInput, HelpOfferResult,
} from '../../shared/types';
import { realApi } from './realApi';

/** architecture.md §8.3 — realApi provides exactly these functions. Errors are thrown as ApiError. */
export interface Api {
  // Victim
  submitReport(sub: ReportSubmission): Promise<{ ok: true; code: string }>;
  track(code: string, pin: string): Promise<TrackView>;
  verifyPhone(code: string, pin: string, phone: string, otp: string): Promise<{ ok: true }>;
  getVictimChat(code: string, pin: string): Promise<{ open: boolean; messages: ChatMessage[] }>;
  sendVictimMessage(code: string, pin: string, msg: OutgoingMessage): Promise<ChatMessage>;
  // Public
  getPublicIncidents(): Promise<{ generatedAt: string; incidents: PublicIncident[] }>;
  /** F29: offer help on a hazard on the map (or join it, when a coordinator opened it to anyone). */
  offerHelp(code: string, input: HelpOfferInput): Promise<HelpOfferResult>;
  // Auth
  login(email: string, password: string): Promise<{ token: string; user: SessionUser }>;
  me(): Promise<{ user: SessionUser }>;
  // Admin
  listIncidents(): Promise<{ counts: Record<PriorityLevel, number>; incidents: IncidentListItem[] }>;
  getIncident(id: string): Promise<IncidentDetail>;
  editIncident(id: string, patch: IncidentPatch): Promise<IncidentDetail>;
  verifyIncident(id: string, publicArea?: string): Promise<IncidentDetail>;
  rejectIncident(id: string, reason: string): Promise<IncidentDetail>;
  overridePriority(id: string, level: PriorityLevel | null, reason?: string): Promise<IncidentDetail>;
  escalateIncident(id: string, note?: string): Promise<IncidentDetail>;
  resolveIncident(id: string, note?: string): Promise<IncidentDetail>;
  mergeIncident(id: string, intoId: string): Promise<IncidentDetail>;
  dismissDuplicate(id: string): Promise<IncidentDetail>;
  assignVolunteer(id: string, volunteerId: string): Promise<IncidentDetail>;
  cancelAssignment(assignmentId: string): Promise<IncidentDetail>;
  allocateResource(id: string, resourceId: string, quantity: number): Promise<IncidentDetail>;
  /** F29: let anyone join from the map (with the public task), or stop that. */
  setOpenToAll(id: string, open: boolean, task?: string): Promise<IncidentDetail>;
  acceptHelpOffer(id: string): Promise<IncidentDetail>;
  declineHelpOffer(id: string): Promise<IncidentDetail>;
  getDispatch(): Promise<DispatchState>;
  saveDispatch(settings: DispatchSettings): Promise<DispatchState>;
  listResources(): Promise<Resource[]>;
  createResource(r: ResourceInput): Promise<Resource>;
  updateResource(id: string, patch: Partial<ResourceInput>): Promise<Resource>;
  // Volunteer
  getMyProfile(): Promise<VolunteerProfile>;
  updateMyProfile(patch: VolunteerProfilePatch): Promise<VolunteerProfile>;
  listMyAssignments(): Promise<VolunteerAssignment[]>;
  updateAssignmentStatus(id: string, status: AssignmentStatus, reason?: UnableReason | string): Promise<VolunteerAssignment>;
  getAssignmentChat(id: string): Promise<{ open: boolean; threads: ChatThread[] }>;
  /** F29: take a hazard from the public map that nobody has yet. */
  takeIncident(code: string): Promise<VolunteerAssignment>;
  /** F28: this device's push address for SOS notifications (null stops them). */
  registerPushToken(token: string | null): Promise<{ ok: true }>;
  sendVolunteerMessage(id: string, reportId: string, msg: OutgoingMessage): Promise<ChatMessage>;
  // Volunteer registration (F26)
  applyAsVolunteer(input: VolunteerApplicationInput): Promise<{ ok: true }>;
  listApplications(status: ApplicationStatus): Promise<VolunteerApplication[]>;
  approveApplication(id: string): Promise<{ ok: true }>;
  rejectApplication(id: string, reason: string): Promise<{ ok: true }>;
  listVolunteers(): Promise<VolunteerListItem[]>;
  // Dev
  resetDemo(): Promise<{ ok: true }>;
  // Live change signals (Server-Sent Events, architecture D12). Each returns an unsubscribe function. `onLive`
  // reports whether the stream is connected; screens poll less while it is.
  watchAdmin(onChange: (incidentId: string | null) => void, onLive?: (live: boolean) => void): () => void;
  watchVolunteer(onChange: () => void, onLive?: (live: boolean) => void): () => void;
  watchTrack(code: string, pin: string, onChange: () => void, onLive?: (live: boolean) => void): () => void;
}

export const EMERGENCY_NUMBER: string = import.meta.env.VITE_EMERGENCY_NUMBER || '112';

export const api: Api = realApi;

// ---------- Session token (sent by realApi as the bearer token) ----------
const TOKEN_KEY = 'authToken';
export function getToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}
