// shared/keywordExtractor.ts — rule-based text → Extraction (rules.md BR-10).
// Used for the offline preview on the phone and as the server fallback when AI fails.
import type { Extraction, IncidentType, Need } from './types';
import { HAZARD_TYPES } from './types';

const TYPE_KEYWORDS: Record<IncidentType, string[]> = {
  FLOOD: ['flood', 'flooded', 'flooding', 'water entered', 'water entering', 'submerged', 'drowning', 'waterlogged', 'வெள்ளம்', 'vellam'],
  CYCLONE: ['cyclone', 'storm', 'strong wind', 'புயல்', 'puyal'],
  HEAVY_RAIN: ['heavy rain', 'raining heavily', 'downpour', 'மழை', 'mazhai'],
  FIRE: ['fire', 'smoke', 'burning', 'flames', 'தீ', 'thee'],
  LANDSLIDE: ['landslide', 'mudslide', 'land slide'],
  BUILDING_COLLAPSE: ['collapsed', 'collapse', 'wall fell', 'roof fell', 'building fell'],
  ROAD_BLOCKED: ['road blocked', 'tree fallen', 'fallen tree', "can't cross", 'cannot cross', 'road closed'],
  POWER_OUTAGE: ['power cut', 'no power', 'no electricity', 'current illa', 'transformer', 'power outage'],
  PEOPLE_TRAPPED: ['trapped', 'stuck', 'cannot get out', "can't get out"],
  MEDICAL: ['injured', 'bleeding', 'unconscious', 'heart attack', 'not breathing', 'fainted'],
  OTHER: [],
};

const FLAG_KEYWORDS = {
  trapped: ['trapped', 'stuck', 'cannot get out', "can't get out", 'no way out', 'cannot move', "can't move"],
  vulnerable: ['grandmother', 'grandfather', 'elderly', 'old man', 'old woman', 'old lady', 'baby', 'infant', 'child', 'children', 'kid', 'pregnant', 'disabled', 'wheelchair', 'patient', 'பாட்டி', 'paati', 'thatha'],
  mobilityIssue: ['cannot walk', "can't walk", 'unable to walk', 'wheelchair', 'bedridden', 'paralysed', 'paralyzed'],
  medical: ['injured', 'bleeding', 'unconscious', 'sick', 'medicine', 'breathing', 'heart', 'fever', 'fracture', 'pregnant'],
  danger: ['rising', 'entering', 'entered', 'spreading', 'collapsing', 'electric wire', 'live wire', 'current wire', 'gas leak', 'sinking'],
};

const PLACE_WORDS = ['street', 'road', 'nagar', 'salai', 'colony', 'lane', 'bridge', 'school', 'temple', 'church', 'mosque', 'hospital', 'market', 'station'];
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// Normalise curly apostrophes so "can’t" matches "can't".
const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'");

// ASCII keywords match on word boundaries ("thee" must not match "three"); Tamil script uses substring match.
function has(text: string, keyword: string): boolean {
  if (/^[\x00-\x7F]+$/.test(keyword)) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z])${escaped}($|[^a-z])`).test(text);
  }
  return text.includes(keyword);
}
const hits = (text: string, words: string[]) => words.filter((w) => has(text, w)).length;

function parsePeople(t: string): number | null {
  const patterns = [/(\d+)\s+(people|persons|members|of us)/, /we are (\d+)/, /family of (\d+)/];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      const n = parseInt(m[1], 10);
      return n >= 0 && n <= 500 ? n : null;
    }
  }
  const wordMatch = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(people|persons|members)\b/);
  if (wordMatch) return NUMBER_WORDS[wordMatch[1]];
  if (/\b(several|many|few)\b/.test(t)) return 3;
  return null;
}

function parsePlaces(original: string): string[] {
  const out: string[] = [];
  const re = /\b(?:near|at|opposite|behind|beside|on)\s+([^.,;:!?\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(original)) !== null) {
    const phrase = m[1].trim().split(/\s+/).slice(0, 4).join(' ');
    const lower = phrase.toLowerCase();
    const capitalised = /(^|\s)[A-Z]/.test(phrase);
    const placeWord = PLACE_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(lower));
    if (phrase && (capitalised || placeWord) && !out.includes(phrase)) out.push(phrase);
  }
  return out.slice(0, 5);
}

export function keywordExtractor(text: string): Extraction {
  const t = norm(text);

  // Type: hazard type with most hits, else situation type with most hits, else OTHER.
  const scored = (Object.keys(TYPE_KEYWORDS) as IncidentType[])
    .map((type) => ({ type, n: hits(t, TYPE_KEYWORDS[type]) }))
    .filter((s) => s.n > 0);
  const hazards = scored.filter((s) => HAZARD_TYPES.includes(s.type)).sort((a, b) => b.n - a.n);
  const situations = scored.filter((s) => !HAZARD_TYPES.includes(s.type)).sort((a, b) => b.n - a.n);
  const type: IncidentType = hazards[0]?.type ?? situations[0]?.type ?? 'OTHER';

  const trapped = hits(t, FLAG_KEYWORDS.trapped) > 0;
  const vulnerable = hits(t, FLAG_KEYWORDS.vulnerable) > 0;
  const mobilityIssue = hits(t, FLAG_KEYWORDS.mobilityIssue) > 0;
  const medical = hits(t, FLAG_KEYWORDS.medical) > 0;
  const danger = hits(t, FLAG_KEYWORDS.danger) > 0;

  const needs = new Set<Need>();
  if (trapped || ((type === 'FLOOD' || type === 'CYCLONE') && danger)) needs.add('EVACUATION');
  if (trapped || has(t, 'rescue') || has(t, 'help us out')) needs.add('RESCUE');
  if (medical) needs.add('MEDICAL');
  if (mobilityIssue) needs.add('PHYSICAL_HELP');
  if (['food', 'hungry', 'drinking water', 'water to drink'].some((w) => has(t, w))) needs.add('FOOD_WATER');
  if (['shelter', 'place to stay', 'homeless'].some((w) => has(t, w))) needs.add('SHELTER');

  return {
    type,
    people: parsePeople(t),
    vulnerable,
    mobilityIssue,
    trapped,
    medical,
    danger,
    needs: [...needs],
    places: parsePlaces(text),
    summary: text.trim().slice(0, 200),
  };
}
