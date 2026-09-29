// shared/volunteerMatch.ts — rank volunteers for an incident (rules.md BR-60…BR-63).
import { MATCH } from './constants';
import { distanceBetween, formatDistance } from './linking';
import type { AssignmentStatus, Availability, Equipment, IncidentType, Need, Skill, Vehicle, VolunteerSuggestion } from './types';
import { ACTIVE_ASSIGNMENT } from './types';

export interface MatchIncident {
  id: string;
  type: IncidentType;
  trapped: boolean;
  medical: boolean;
  vulnerable: boolean;
  needs: Need[];
  lat: number | null;
  lng: number | null;
}
export interface MatchVolunteer {
  id: string;
  name: string;
  skills: Skill[];
  equipment: Equipment[];
  vehicle: Vehicle;
  availability: Availability;
  lat: number | null;
  lng: number | null;
}
export interface MatchAssignment { incidentId: string; volunteerId: string; status: AssignmentStatus }

interface Group<T> { label: string; items: T[] }

/** Human label for an enum value, e.g. FIRST_AID → "First aid". */
export function humanize(v: string): string {
  const s = v.toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function requirementGroups(i: MatchIncident): { skills: Group<Skill>[]; equipment: Group<Equipment>[] } {
  const skills: Group<Skill>[] = [];
  const equipment: Group<Equipment>[] = [];
  const addS = (items: Skill[]) => {
    if (!skills.some((g) => g.items.join() === items.join())) skills.push({ label: items.map(humanize).join(' or '), items });
  };
  const addE = (items: Equipment[]) => {
    if (!equipment.some((g) => g.items.join() === items.join())) equipment.push({ label: items.map(humanize).join(' or '), items });
  };

  if ((i.type === 'FLOOD' || i.type === 'CYCLONE') && (i.trapped || i.needs.includes('EVACUATION') || i.needs.includes('RESCUE'))) {
    addS(['SWIMMING', 'BOAT_HANDLING']);
    addE(['LIFE_JACKET', 'BOAT']);
  }
  if (i.trapped || ['PEOPLE_TRAPPED', 'BUILDING_COLLAPSE', 'LANDSLIDE'].includes(i.type)) {
    addS(['SEARCH_RESCUE']);
    addE(['ROPE', 'TORCH']);
  }
  if (i.medical || i.vulnerable || i.needs.includes('MEDICAL')) {
    addS(['FIRST_AID', 'MEDICAL_PRO']);
    addE(['MEDICAL_KIT']);
  }
  if (i.type === 'FIRE') {
    addS(['FIREFIGHTING']);
    addE(['FIRE_EXTINGUISHER']);
  }
  if (i.needs.includes('FOOD_WATER') || i.needs.includes('SHELTER')) addS(['DRIVING', 'GENERAL']);
  if (i.needs.includes('PHYSICAL_HELP')) addS(['GENERAL', 'FIRST_AID', 'SEARCH_RESCUE']);
  return { skills, equipment };
}

export function isEligible(v: MatchVolunteer, incidentId: string, assignments: MatchAssignment[]): boolean {
  if (v.availability !== 'AVAILABLE') return false;
  const mine = assignments.filter((a) => a.volunteerId === v.id);
  if (mine.some((a) => ACTIVE_ASSIGNMENT.includes(a.status))) return false;
  if (mine.some((a) => a.incidentId === incidentId && (a.status === 'DECLINED' || a.status === 'UNABLE'))) return false;
  return true;
}

export function rankVolunteers(i: MatchIncident, volunteers: MatchVolunteer[], assignments: MatchAssignment[]): VolunteerSuggestion[] {
  const { skills, equipment } = requirementGroups(i);
  const scored = volunteers
    .filter((v) => isEligible(v, i.id, assignments))
    .map((v) => {
      const reasons: string[] = [];
      const missing: string[] = [];
      let sOk = 0;
      for (const g of skills) {
        const hit = g.items.filter((s) => v.skills.includes(s));
        if (hit.length) {
          sOk++;
          hit.forEach((h) => { const l = `✓ ${humanize(h)}`; if (!reasons.includes(l)) reasons.push(l); });
        } else missing.push(`✗ ${g.label}`);
      }
      let eOk = 0;
      for (const g of equipment) {
        const hit = g.items.filter((e) => v.equipment.includes(e));
        if (hit.length) {
          eOk++;
          hit.forEach((h) => { const l = `✓ ${humanize(h)}`; if (!reasons.includes(l)) reasons.push(l); });
        } else missing.push(`✗ ${g.label}`);
      }
      const d = distanceBetween(i, v);
      let dist: number = MATCH.DIST_UNKNOWN;
      if (d !== null) dist = d <= 2000 ? MATCH.DIST_2KM : d <= 5000 ? MATCH.DIST_5KM : d <= 10000 ? MATCH.DIST_10KM : 0;
      if (d !== null) reasons.push(`${formatDistance(d)} away`);
      const score = Math.round(
        (skills.length ? (MATCH.SKILLS * sOk) / skills.length : MATCH.SKILLS) +
          (equipment.length ? (MATCH.EQUIPMENT * eOk) / equipment.length : MATCH.EQUIPMENT) +
          dist,
      );
      return { volunteerId: v.id, name: v.name, score, distanceM: d, reasons, missing };
    });
  return scored
    .sort((a, b) => b.score - a.score || (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
    .slice(0, MATCH.TOP_N);
}
