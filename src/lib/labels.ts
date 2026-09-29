// src/lib/labels.ts — enum → display text, icons and colour keys. UI copy lives here, not in components.
import type {
  AssignmentStatus, Availability, ConfidenceBand, Equipment, IncidentStatus, IncidentType, MarkerColor, Need,
  PriorityLevel, PublicStatus, ResourceCategory, Skill, UnableReason, Vehicle,
} from '../../shared/types';

export const TYPE_LABEL: Record<IncidentType, string> = {
  FLOOD: 'Flood', CYCLONE: 'Cyclone', HEAVY_RAIN: 'Heavy rain', FIRE: 'Fire', BUILDING_COLLAPSE: 'Building collapse',
  LANDSLIDE: 'Landslide', ROAD_BLOCKED: 'Road blocked', POWER_OUTAGE: 'Power outage', PEOPLE_TRAPPED: 'People trapped',
  MEDICAL: 'Medical emergency', OTHER: 'Other emergency',
};
export const TYPE_ICON: Record<IncidentType, string> = {
  FLOOD: '🌊', CYCLONE: '🌀', HEAVY_RAIN: '🌧️', FIRE: '🔥', BUILDING_COLLAPSE: '🏚️', LANDSLIDE: '⛰️',
  ROAD_BLOCKED: '🚧', POWER_OUTAGE: '⚡', PEOPLE_TRAPPED: '🆘', MEDICAL: '🩺', OTHER: '⚠️',
};
export const typeLabel = (t: IncidentType) => TYPE_LABEL[t];

export const NEED_LABEL: Record<Need, string> = {
  EVACUATION: 'Evacuation', RESCUE: 'Rescue', MEDICAL: 'Medical help', PHYSICAL_HELP: 'Help moving someone',
  FOOD_WATER: 'Food or water', SHELTER: 'Shelter', OTHER: 'Other',
};

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  NEW: 'New', VERIFIED: 'Verified', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', REJECTED: 'Rejected', MERGED: 'Merged',
};
export const PRIORITY_LABEL: Record<PriorityLevel, string> = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
export const BAND_LABEL: Record<ConfidenceBand, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
export const PUBLIC_STATUS_LABEL: Record<PublicStatus, string> = { ACTIVE: 'Active', RESPONDING: 'Help on the way', RESOLVED: 'Resolved' };

export const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  ASSIGNED: 'Waiting for reply', ACCEPTED: 'Accepted', DECLINED: 'Declined', EN_ROUTE: 'On the way', ON_SITE: 'Arrived',
  ASSISTING: 'Helping', DONE: 'Done', UNABLE: 'Unable to continue', CANCELLED: 'Cancelled',
};
export const AVAILABILITY_LABEL: Record<Availability, string> = { AVAILABLE: 'Available', BUSY: 'On a response', OFFLINE: 'Not available' };
export const UNABLE_LABEL: Record<UnableReason, string> = {
  NO_ACCESS: 'Cannot reach the place', MISSING_EQUIPMENT: 'Missing equipment', UNSAFE: 'Unsafe to continue',
  PERSONAL: 'Personal reason', TOO_FAR: 'Too far away', OTHER: 'Other reason',
};
export const SKILL_LABEL: Record<Skill, string> = {
  FIRST_AID: 'First aid', MEDICAL_PRO: 'Medical professional', SWIMMING: 'Swimming', BOAT_HANDLING: 'Boat handling',
  SEARCH_RESCUE: 'Search and rescue', FIREFIGHTING: 'Firefighting', DRIVING: 'Driving', GENERAL: 'General help',
};
export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  MEDICAL_KIT: 'Medical kit', LIFE_JACKET: 'Life jacket', BOAT: 'Boat', ROPE: 'Rope', TORCH: 'Torch', FIRE_EXTINGUISHER: 'Fire extinguisher',
};
export const VEHICLE_LABEL: Record<Vehicle, string> = { NONE: 'No vehicle', BIKE: 'Bicycle', MOTORCYCLE: 'Motorcycle', CAR: 'Car', TRUCK: 'Truck', BOAT: 'Boat' };
export const CATEGORY_LABEL: Record<ResourceCategory, string> = {
  WATER: 'Water', FOOD: 'Food', MEDICINE: 'Medicine', BLANKET: 'Blankets', GENERATOR: 'Generator', VEHICLE: 'Vehicle',
  BOAT: 'Boat', SHELTER: 'Shelter', OTHER: 'Other',
};

/** Tone keys map to CSS classes in index.css (.tone-*). */
export type Tone = 'critical' | 'high' | 'medium' | 'low' | 'ok' | 'neutral' | 'info' | 'lime';
export const PRIORITY_TONE: Record<PriorityLevel, Tone> = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
export const MARKER_TONE: Record<MarkerColor, Tone> = { RED: 'critical', ORANGE: 'high', YELLOW: 'medium', GREEN: 'ok' };
export const STATUS_TONE: Record<IncidentStatus, Tone> = {
  NEW: 'info', VERIFIED: 'neutral', IN_PROGRESS: 'lime', RESOLVED: 'ok', REJECTED: 'neutral', MERGED: 'neutral',
};
export const BAND_TONE: Record<ConfidenceBand, Tone> = { HIGH: 'ok', MEDIUM: 'medium', LOW: 'neutral' };

export const PEOPLE_CHOICES: { label: string; value: number | null }[] = [
  { label: '1', value: 1 }, { label: '2–4', value: 3 }, { label: '5–9', value: 7 }, { label: '10+', value: 10 }, { label: 'Not sure', value: null },
];

export const VICTIM_QUICK_REPLIES = ['We are on the 2nd floor', 'Water is rising', 'Someone needs medical help', 'Please hurry'];
export const VOLUNTEER_QUICK_REPLIES = [
  "I'm 5 minutes away", 'Stay where you are', 'Wave a cloth or torch from the window', 'Can you reach the roof?', "I've arrived — where are you?",
];
