// shared/types.ts — the ONLY place types and enums are defined (rules.md AR-10).
// Mirrors docs/architecture.md §7 (enums) and §8 (API contract).

export const INCIDENT_TYPES = [
  'FLOOD', 'CYCLONE', 'HEAVY_RAIN', 'FIRE', 'BUILDING_COLLAPSE', 'LANDSLIDE',
  'ROAD_BLOCKED', 'POWER_OUTAGE', 'PEOPLE_TRAPPED', 'MEDICAL', 'OTHER',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];
export const SITUATION_TYPES: IncidentType[] = ['PEOPLE_TRAPPED', 'MEDICAL', 'OTHER'];
export const HAZARD_TYPES: IncidentType[] = INCIDENT_TYPES.filter((t) => !SITUATION_TYPES.includes(t));

export const NEEDS = ['EVACUATION', 'RESCUE', 'MEDICAL', 'PHYSICAL_HELP', 'FOOD_WATER', 'SHELTER', 'OTHER'] as const;
export type Need = (typeof NEEDS)[number];

export const INCIDENT_STATUSES = ['NEW', 'VERIFIED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'MERGED'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const ACTIVE_STATUSES: IncidentStatus[] = ['NEW', 'VERIFIED', 'IN_PROGRESS'];

export const PRIORITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];
export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';
export type Role = 'ADMIN' | 'VOLUNTEER';

export const SKILLS = ['FIRST_AID', 'MEDICAL_PRO', 'SWIMMING', 'BOAT_HANDLING', 'SEARCH_RESCUE', 'FIREFIGHTING', 'DRIVING', 'GENERAL'] as const;
export type Skill = (typeof SKILLS)[number];
export const EQUIPMENT = ['MEDICAL_KIT', 'LIFE_JACKET', 'BOAT', 'ROPE', 'TORCH', 'FIRE_EXTINGUISHER'] as const;
export type Equipment = (typeof EQUIPMENT)[number];
export const VEHICLES = ['NONE', 'BIKE', 'MOTORCYCLE', 'CAR', 'TRUCK', 'BOAT'] as const;
export type Vehicle = (typeof VEHICLES)[number];
export type Availability = 'AVAILABLE' | 'BUSY' | 'OFFLINE';

export type AssignmentStatus =
  | 'ASSIGNED' | 'ACCEPTED' | 'DECLINED' | 'EN_ROUTE' | 'ON_SITE' | 'ASSISTING' | 'DONE' | 'UNABLE' | 'CANCELLED';
export const ACTIVE_ASSIGNMENT: AssignmentStatus[] = ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'ASSISTING'];
export const CHAT_OPEN_ASSIGNMENT: AssignmentStatus[] = ['ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'ASSISTING'];

export const UNABLE_REASONS = ['NO_ACCESS', 'MISSING_EQUIPMENT', 'UNSAFE', 'PERSONAL', 'TOO_FAR', 'OTHER'] as const;
export type UnableReason = (typeof UNABLE_REASONS)[number];

export const RESOURCE_CATEGORIES = ['WATER', 'FOOD', 'MEDICINE', 'BLANKET', 'GENERATOR', 'VEHICLE', 'BOAT', 'SHELTER', 'OTHER'] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export const VICTIM_STEPS = ['RECEIVED', 'REVIEWING', 'VERIFIED', 'HELP_ASSIGNED', 'ON_THE_WAY', 'ARRIVED', 'RESOLVED'] as const;
export type VictimStep = (typeof VICTIM_STEPS)[number] | 'CLOSED';
export type MarkerColor = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';
export type PublicStatus = 'ACTIVE' | 'RESPONDING' | 'RESOLVED';

export type ProcessingStatus = 'PENDING' | 'DONE' | 'FAILED';
export type AiSource = 'AI' | 'KEYWORDS';
export type TranscriptStatus = 'NONE' | 'DONE' | 'FAILED';
export type MessageSender = 'VICTIM' | 'VOLUNTEER';

export interface Reason { label: string; points: number }

export interface Extraction {
  type: IncidentType;
  people: number | null;
  vulnerable: boolean;
  mobilityIssue: boolean;
  trapped: boolean;
  medical: boolean;
  danger: boolean;
  needs: Need[];
  places: string[];
  summary: string;
}

export interface GeoPoint { lat: number; lng: number }

// ---------- Victim ----------
export interface ReportSubmission {
  id: string;
  code: string;
  pin: string;
  deviceId: string;
  text: string;
  lat: number | null;
  lng: number | null;
  locationText: string | null;
  people: number | null;
  needs: Need[];
  phone: string | null;
  photoBase64: string | null;
  audioBase64: string | null;
  audioMime: string | null;
  audioSeconds: number | null;
  createdAt: string;
}

export interface TrackView {
  code: string;
  step: VictimStep;
  updatedAt: string;
  messages: { at: string; text: string }[];
  phoneVerified: boolean;
  chatOpen: boolean;
}

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  text: string | null;
  audioUrl: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}
export interface ChatThread { reportId: string; label: string; messages: ChatMessage[] }
export interface OutgoingMessage {
  text?: string;
  audioBase64?: string;
  audioMime?: string;
  lat?: number;
  lng?: number;
}

// ---------- Public ----------
export interface PublicIncident {
  code: string;
  type: IncidentType;
  color: MarkerColor;
  area: string | null;
  lat: number;
  lng: number;
  priority: PriorityLevel;
  confidenceBand: ConfidenceBand;
  verified: boolean;
  reportCount: number;
  status: PublicStatus;
  advice: string;
  updatedAt: string;
}

// ---------- Auth ----------
export interface SessionUser { id: string; name: string; role: Role }

// ---------- Admin ----------
export interface IncidentListItem {
  id: string;
  code: string;
  type: IncidentType;
  status: IncidentStatus;
  priority: PriorityLevel;
  overridden: boolean;
  confidence: number;
  confidenceBand: ConfidenceBand;
  people: number | null;
  locationText: string | null;
  reportCount: number;
  hasVoice: boolean;
  possibleDuplicateCode: string | null;
  needsReassign: boolean;
  readyToResolve: boolean;
  escalationRecommended: boolean;
  escalated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReport {
  id: string;
  label: string;
  text: string;
  transcript: string | null;
  transcriptStatus: TranscriptStatus;
  photoUrl: string | null;
  audioUrl: string | null;
  audioSeconds: number | null;
  people: number | null;
  needs: Need[];
  phone: string | null;
  phoneVerified: boolean;
  extraction: Extraction | null;
  aiSource: AiSource | null;
  processingStatus: ProcessingStatus;
  lat: number | null;
  lng: number | null;
  locationText: string | null;
  createdAt: string;
  receivedAt: string;
}

export interface VolunteerSuggestion {
  volunteerId: string;
  name: string;
  score: number;
  distanceM: number | null;
  reasons: string[];
  missing: string[];
}

export interface IncidentDetail extends IncidentListItem {
  lat: number | null;
  lng: number | null;
  publicArea: string | null;
  vulnerable: boolean;
  trapped: boolean;
  medical: boolean;
  danger: boolean;
  needs: Need[];
  summary: string | null;
  confidenceReasons: Reason[];
  priorityScore: number;
  computedPriority: PriorityLevel;
  priorityReasons: Reason[];
  overrideReason: string | null;
  escalationReasons: Reason[];
  escalatedAt: string | null;
  verifiedAt: string | null;
  resolvedAt: string | null;
  rejectReason: string | null;
  reports: AdminReport[];
  possibleDuplicate: { id: string; code: string; type: IncidentType; summary: string | null; distanceM: number | null } | null;
  related: { id: string; code: string; type: IncidentType; text: string }[];
  suggestions: VolunteerSuggestion[];
  assignments: { id: string; volunteerId: string; volunteerName: string; volunteerPhone: string | null; status: AssignmentStatus; reason: string | null; updatedAt: string }[]; // staff-only view
  allocations: { id: string; resourceName: string; quantity: number; unit: string; createdAt: string }[];
  logs: { at: string; text: string; public: boolean }[];
  chats: ChatThread[];
}

export interface IncidentPatch {
  type?: IncidentType;
  people?: number | null;
  vulnerable?: boolean;
  trapped?: boolean;
  medical?: boolean;
  danger?: boolean;
  needs?: Need[];
  lat?: number | null;
  lng?: number | null;
  locationText?: string | null;
  publicArea?: string | null;
  summary?: string | null;
}

export interface Resource {
  id: string;
  name: string;
  category: ResourceCategory;
  quantity: number;
  unit: string;
  locationText: string;
}
export type ResourceInput = Omit<Resource, 'id'>;

// ---------- Volunteer ----------
export interface VolunteerProfile {
  id: string;
  name: string;
  skills: Skill[];
  equipment: Equipment[];
  vehicle: Vehicle;
  availability: Availability;
  lat: number | null;
  lng: number | null;
}
export type VolunteerProfilePatch = Partial<Pick<VolunteerProfile, 'availability' | 'skills' | 'equipment' | 'vehicle' | 'lat' | 'lng'>>;

export interface VolunteerAssignment {
  id: string;
  status: AssignmentStatus;
  reason: string | null;
  updatedAt: string;
  incident: {
    id: string;
    code: string;
    type: IncidentType;
    summary: string | null;
    people: number | null;
    vulnerable: boolean;
    trapped: boolean;
    medical: boolean;
    danger: boolean;
    needs: Need[];
    lat: number | null;
    lng: number | null;
    locationText: string | null;
    priority: PriorityLevel;
  };
  reporters: { reportId: string; label: string }[];
}

// ---------- Volunteer registration (F26) ----------
export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface VolunteerApplicationInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  skills: Skill[];
  equipment: Equipment[];
  vehicle: Vehicle;
  lat: number | null;
  lng: number | null;
  locationText: string | null;
  /** JPEG photo of an ID proof, base64 without prefix (resized on the phone like report photos). */
  proofBase64: string;
}
/** Admin view of an application. Never includes the password. */
export interface VolunteerApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  skills: Skill[];
  equipment: Equipment[];
  vehicle: Vehicle;
  locationText: string | null;
  hasLocation: boolean;
  status: ApplicationStatus;
  rejectReason: string | null;
  proofUrl: string | null;
  createdAt: string;
  reviewedAt: string | null;
}
/** Admin list of approved volunteers (staff-only: includes phone). */
export interface VolunteerListItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  skills: Skill[];
  equipment: Equipment[];
  vehicle: Vehicle;
  availability: Availability;
}

// ---------- Server records (DB rows in camelCase; converted only in server/mappers.ts) ----------
export interface ApplicationRecord {
  id: string; userId: string; name: string; email: string; phone: string; skills: Skill[]; equipment: Equipment[];
  vehicle: Vehicle; lat: number | null; lng: number | null; locationText: string | null; proofPath: string | null;
  status: ApplicationStatus; rejectReason: string | null; reviewedBy: string | null; reviewedAt: string | null; createdAt: string;
}
export interface ProfileRecord {
  id: string; name: string; email: string; role: Role; phone: string | null;
  skills: Skill[]; equipment: Equipment[]; vehicle: Vehicle; availability: Availability;
  lat: number | null; lng: number | null; createdAt: string;
}
export interface IncidentRecord {
  id: string; code: string; type: IncidentType; lat: number | null; lng: number | null; locationText: string | null;
  publicArea: string | null; people: number | null; vulnerable: boolean; trapped: boolean; medical: boolean; danger: boolean;
  needs: Need[]; summary: string | null; status: IncidentStatus; confidence: number; confidenceReasons: Reason[];
  priorityScore: number; priority: PriorityLevel; priorityReasons: Reason[]; priorityOverride: PriorityLevel | null;
  overrideReason: string | null; escalationRecommended: boolean; escalationReasons: Reason[]; escalatedAt: string | null;
  verifiedAt: string | null; onSiteAt: string | null; resolvedAt: string | null; rejectReason: string | null;
  possibleDuplicateOf: string | null; mergedInto: string | null; createdAt: string; updatedAt: string;
}
export interface ReportRecord {
  id: string; code: string; pin: string; deviceId: string; incidentId: string | null; text: string;
  transcript: string | null; transcriptStatus: TranscriptStatus; lat: number | null; lng: number | null;
  locationText: string | null; people: number | null; needs: Need[]; phone: string | null; phoneVerified: boolean;
  photoPath: string | null; audioPath: string | null; audioSeconds: number | null;
  extraction: Extraction | null; aiSource: AiSource | null; processingStatus: ProcessingStatus;
  createdAt: string; receivedAt: string;
}
export interface AssignmentRecord {
  id: string; incidentId: string; volunteerId: string; status: AssignmentStatus; reason: string | null;
  createdAt: string; updatedAt: string;
}
export interface MessageRecord {
  id: string; incidentId: string; reportId: string; assignmentId: string; sender: MessageSender; text: string | null;
  audioPath: string | null; lat: number | null; lng: number | null; createdAt: string;
}
export interface ResourceRecord extends Resource { createdAt: string }
export interface AllocationRecord { id: string; resourceId: string; incidentId: string; quantity: number; createdAt: string }
export interface LogRecord { id: string; incidentId: string; text: string; public: boolean; createdAt: string }

// ---------- Errors ----------
export type ErrorCode =
  | 'VALIDATION' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CODE_TAKEN' | 'INVALID_STATE'
  | 'CHAT_CLOSED' | 'INSUFFICIENT_QUANTITY' | 'SERVER_ERROR' | 'NETWORK';

export class ApiError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}
