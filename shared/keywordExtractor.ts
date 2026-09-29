// shared/keywordExtractor.ts — rule-based text → Extraction (rules.md BR-10).
// Used for the offline preview on the phone and as the server fallback when AI fails.
// Keywords: English, Tamil (script + Tanglish) and Hindi (Devanagari + Hinglish).
import type { Extraction, IncidentType, Need } from './types';
import { HAZARD_TYPES } from './types';

const TYPE_KEYWORDS: Record<IncidentType, string[]> = {
  FLOOD: ['flood', 'flooded', 'flooding', 'water entered', 'water entering', 'submerged', 'drowning', 'waterlogged', 'வெள்ளம்', 'vellam', 'बाढ़', 'बाढ', 'पानी भर गया', 'पानी भर रहा', 'पानी घुस गया', 'पानी घुस रहा', 'डूब गया', 'डूब रहा', 'डूब रहे', 'baadh', 'paani bhar gaya', 'pani bhar gaya', 'paani ghus gaya', 'pani ghus gaya'],
  CYCLONE: ['cyclone', 'storm', 'strong wind', 'புயல்', 'puyal', 'चक्रवात', 'तूफान', 'तूफ़ान', 'आंधी', 'toofan', 'toofaan', 'tufan', 'aandhi'],
  HEAVY_RAIN: ['heavy rain', 'raining heavily', 'downpour', 'மழை', 'mazhai', 'भारी बारिश', 'तेज बारिश', 'मूसलाधार', 'bhari barish', 'tez barish', 'bahut barish'],
  FIRE: ['fire', 'smoke', 'burning', 'flames', 'தீ', 'thee', 'आग', 'धुआं', 'धुआँ', 'aag', 'dhuan', 'dhuaan'],
  LANDSLIDE: ['landslide', 'mudslide', 'land slide', 'भूस्खलन', 'मलबा', 'bhooskhalan', 'malba'],
  BUILDING_COLLAPSE: ['collapsed', 'collapse', 'wall fell', 'roof fell', 'building fell', 'इमारत गिर गई', 'मकान गिर गया', 'घर गिर गया', 'दीवार गिर गई', 'छत गिर गई', 'ढह गया', 'ढह गई', 'makaan gir gaya', 'ghar gir gaya', 'deewar gir gayi', 'chhat gir gayi'],
  ROAD_BLOCKED: ['road blocked', 'tree fallen', 'fallen tree', "can't cross", 'cannot cross', 'road closed', 'रास्ता बंद', 'सड़क बंद', 'पेड़ गिर गया', 'पेड़ गिरा', 'rasta band', 'sadak band', 'ped gir gaya'],
  POWER_OUTAGE: ['power cut', 'no power', 'no electricity', 'current illa', 'transformer', 'power outage', 'बिजली नहीं', 'बिजली चली गई', 'बिजली गई', 'bijli nahi', 'bijli chali gayi', 'light nahi'],
  PEOPLE_TRAPPED: ['trapped', 'stuck', 'cannot get out', "can't get out", 'फंसे', 'फंस गए', 'फंसा', 'फंसी', 'phanse', 'fanse', 'phas gaye', 'fas gaye'],
  MEDICAL: ['injured', 'bleeding', 'unconscious', 'heart attack', 'not breathing', 'fainted', 'घायल', 'खून', 'बेहोश', 'दिल का दौरा', 'सांस नहीं', 'ghayal', 'khoon', 'behosh', 'saans nahi'],
  OTHER: [],
};

const FLAG_KEYWORDS = {
  trapped: ['trapped', 'stuck', 'cannot get out', "can't get out", 'no way out', 'cannot move', "can't move", 'फंसे', 'फंस गए', 'फंसा', 'फंसी', 'निकल नहीं', 'phanse', 'fanse', 'phas gaye', 'fas gaye', 'nikal nahi'],
  vulnerable: ['grandmother', 'grandfather', 'elderly', 'old man', 'old woman', 'old lady', 'baby', 'infant', 'child', 'children', 'kid', 'pregnant', 'disabled', 'wheelchair', 'patient', 'பாட்டி', 'paati', 'thatha', 'दादी', 'दादा', 'नानी', 'नाना', 'बुजुर्ग', 'बूढ़ी', 'बूढ़े', 'बच्चा', 'बच्चे', 'बच्ची', 'शिशु', 'गर्भवती', 'विकलांग', 'मरीज', 'dadi', 'dada', 'nani', 'buzurg', 'bujurg', 'bachcha', 'bachche', 'bacche', 'garbhvati', 'viklang', 'mareez'],
  mobilityIssue: ['cannot walk', "can't walk", 'unable to walk', 'wheelchair', 'bedridden', 'paralysed', 'paralyzed', 'चल नहीं', 'लकवा', 'बिस्तर पर', 'व्हीलचेयर', 'chal nahi', 'lakwa'],
  medical: ['injured', 'bleeding', 'unconscious', 'sick', 'medicine', 'breathing', 'heart', 'fever', 'fracture', 'pregnant', 'घायल', 'खून', 'बेहोश', 'बीमार', 'दवा', 'दवाई', 'सांस', 'बुखार', 'हड्डी टूट', 'ghayal', 'khoon', 'behosh', 'bimar', 'beemar', 'dawai', 'dawa', 'saans', 'bukhar'],
  danger: ['rising', 'entering', 'entered', 'spreading', 'collapsing', 'electric wire', 'live wire', 'current wire', 'gas leak', 'sinking', 'बढ़ रहा', 'बढ़ रही', 'घुस रहा', 'फैल रहा', 'फैल रही', 'बिजली का तार', 'गैस लीक', 'badh raha', 'ghus raha', 'fail raha'],
};

const PLACE_WORDS = ['street', 'road', 'nagar', 'salai', 'colony', 'lane', 'bridge', 'school', 'temple', 'church', 'mosque', 'hospital', 'market', 'station'];
const HINDI_NUMBERS: Record<string, number> = { एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, सात: 7, आठ: 8, नौ: 9, दस: 10 };
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// Normalise curly apostrophes so "can’t" matches "can't", and Unicode forms so "ढ़" typed as one character or as
// "ढ" + nukta matches either way.
const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/[’‘]/g, "'");

// ASCII keywords match on word boundaries ("thee" must not match "three"). Hindi (Devanagari) also matches whole
// words (आग "fire" must not match आगे "ahead"). Tamil joins suffixes onto words, so Tamil script uses substring match.
const DEVANAGARI = /[\u0900-\u097F]/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function has(text: string, rawKeyword: string): boolean {
  const keyword = rawKeyword.normalize('NFC');
  if (/^[\x00-\x7F]+$/.test(keyword)) return new RegExp(`(^|[^a-z])${escape(keyword)}($|[^a-z])`).test(text);
  if (DEVANAGARI.test(keyword)) return new RegExp(`(^|[^\\p{L}\\p{M}])${escape(keyword)}($|[^\\p{L}\\p{M}])`, 'u').test(text);
  return text.includes(keyword);
}
const hits = (text: string, words: string[]) => words.filter((w) => has(text, w)).length;

function parsePeople(t: string): number | null {
  const patterns = [/(\d+)\s+(people|persons|members|of us|लोग|सदस्य|log)/, /we are (\d+)/, /family of (\d+)/, /हम (\d+)/];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      const n = parseInt(m[1], 10);
      return n >= 0 && n <= 500 ? n : null;
    }
  }
  const wordMatch = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(people|persons|members)\b/);
  if (wordMatch) return NUMBER_WORDS[wordMatch[1]];
  const hindiMatch = t.match(/(एक|दो|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ|दस) (लोग|सदस्य)/);
  if (hindiMatch) return HINDI_NUMBERS[hindiMatch[1]];
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
  const hindi = /([^\s.,;:!?।]+(?:\s+[^\s.,;:!?।]+)?)\s+के\s+(?:पास|सामने|पीछे)/g; // "<place> के पास" = near <place>
  while ((m = hindi.exec(original)) !== null) {
    const phrase = m[1].trim();
    if (DEVANAGARI.test(phrase) && !out.includes(phrase)) out.push(phrase);
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
  if (trapped || ['rescue', 'help us out', 'बचाओ', 'बचाइए', 'bachao', 'bachaiye'].some((w) => has(t, w))) needs.add('RESCUE');
  if (medical) needs.add('MEDICAL');
  if (mobilityIssue) needs.add('PHYSICAL_HELP');
  if (['food', 'hungry', 'drinking water', 'water to drink', 'खाना', 'भूखे', 'पीने का पानी', 'khana', 'bhookhe', 'peene ka paani'].some((w) => has(t, w))) needs.add('FOOD_WATER');
  if (['shelter', 'place to stay', 'homeless', 'रहने की जगह', 'आश्रय', 'rehne ki jagah'].some((w) => has(t, w))) needs.add('SHELTER');

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
