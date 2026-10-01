// eval/score.ts — shared scoring for eval/run.ts and eval/prompt-experiment.ts: field-by-field comparison of an
// Extraction with the hand-written expected values, per language and overall.
import { readFileSync } from 'node:fs';
import { computePriority } from '../shared/scoring';
import type { Extraction, Need } from '../shared/types';

export type Expected = Pick<Extraction, 'type' | 'people' | 'vulnerable' | 'mobilityIssue' | 'trapped' | 'medical' | 'danger' | 'needs'>;
export interface Case { id: string; lang: 'en' | 'ta' | 'hi' | 'mixed'; variant?: string; text: string; expected: Expected }
export interface Scored { id: string; lang: Case['lang']; pred: Extraction; ok: Record<Field, boolean>; source?: string; ms?: number }

export const FIELDS = ['type', 'people', 'trapped', 'medical', 'vulnerable', 'danger', 'mobilityIssue', 'needs'] as const;
export type Field = (typeof FIELDS)[number];
export const GROUPS = ['en', 'ta', 'hi', 'mixed', 'all'] as const;
export const GROUP_LABEL: Record<(typeof GROUPS)[number], string> = { en: 'English', ta: 'Tamil', hi: 'Hindi', mixed: 'Mixed (Tanglish/Hinglish)', all: 'All' };

export const readJsonl = <T>(file: URL): T[] =>
  readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as T);

const sameSet = (a: Need[], b: Need[]) => {
  const x = [...new Set(a)];
  return x.length === b.length && x.every((n) => b.includes(n));
};

export function compare(p: Extraction, e: Expected): Record<Field, boolean> {
  return {
    type: p.type === e.type,
    people: p.people === e.people,
    trapped: p.trapped === e.trapped,
    medical: p.medical === e.medical,
    vulnerable: p.vulnerable === e.vulnerable,
    danger: p.danger === e.danger,
    mobilityIssue: p.mobilityIssue === e.mobilityIssue,
    needs: sameSet(p.needs, e.needs),
  };
}

export function summarise(rows: Scored[], cases: Case[]) {
  const table: Record<string, Record<Field | 'allFields', string> & { n: number }> = {};
  for (const g of GROUPS) {
    const sel = rows.filter((r) => g === 'all' || r.lang === g);
    if (sel.length === 0) continue;
    const pct = (k: number) => `${k}/${sel.length} (${Math.round((100 * k) / sel.length)}%)`;
    const acc = Object.fromEntries(FIELDS.map((f) => [f, pct(sel.filter((r) => r.ok[f]).length)])) as Record<Field, string>;
    table[g] = { n: sel.length, ...acc, allFields: pct(sel.filter((r) => FIELDS.every((f) => r.ok[f])).length) };
  }
  // Needs as a multi-label task: micro precision / recall over every (report, need) pair.
  let tp = 0, fp = 0, fn = 0;
  for (const r of rows) {
    const exp = cases.find((c) => c.id === r.id)!.expected.needs;
    const pred = [...new Set(r.pred.needs)];
    tp += pred.filter((n) => exp.includes(n)).length;
    fp += pred.filter((n) => !exp.includes(n)).length;
    fn += exp.filter((n) => !pred.includes(n)).length;
  }
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  return { table, needsMicro: { tp, fp, fn, precision, recall, f1: (2 * precision * recall) / (precision + recall || 1) } };
}

export function printTable(title: string, s: ReturnType<typeof summarise>) {
  console.log(`\n### ${title}\n`);
  console.log(`| Group | n | ${FIELDS.join(' | ')} | all fields |`);
  console.log(`|---|---|${FIELDS.map(() => '---').join('|')}|---|`);
  for (const g of GROUPS) {
    const r = s.table[g];
    if (r) console.log(`| ${GROUP_LABEL[g]} | ${r.n} | ${FIELDS.map((f) => r[f]).join(' | ')} | ${r.allFields} |`);
  }
  const m = s.needsMicro;
  console.log(`\nNeeds (micro): precision ${m.precision.toFixed(2)}, recall ${m.recall.toFixed(2)}, F1 ${m.f1.toFixed(2)} (tp ${m.tp}, fp ${m.fp}, fn ${m.fn})`);
}

export const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

// ------------------------------------------------------------------ false positives and false negatives

export const FLAGS = ['trapped', 'medical', 'vulnerable', 'mobilityIssue', 'danger'] as const;
export interface Confusion { n: number; tp: number; fp: number; fn: number; tn: number; falseAlarmRate: number; missRate: number; precision: number; recall: number; fpIds: string[]; fnIds: string[] }

function confusion(items: { id: string; truth: boolean; pred: boolean }[]): Confusion {
  const ids = (t: boolean, p: boolean) => items.filter((i) => i.truth === t && i.pred === p).map((i) => i.id);
  const tp = ids(true, true).length, fp = ids(false, true).length, fn = ids(true, false).length, tn = ids(false, false).length;
  return {
    n: items.length, tp, fp, fn, tn,
    falseAlarmRate: fp / (fp + tn || 1), // of the reports where it is false, how many the AI flagged anyway
    missRate: fn / (fn + tp || 1),       // of the reports where it is true, how many the AI missed
    precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1),
    fpIds: ids(false, true), fnIds: ids(true, false),
  };
}

/** The priority level the incident would get from these facts alone (BR-25…BR-27; vulnerable = vulnerable OR mobility). */
const levelOf = (e: Expected) => computePriority({ type: e.type, people: e.people, vulnerable: e.vulnerable || e.mobilityIssue, trapped: e.trapped, medical: e.medical, danger: e.danger }).level;

/** False positives / negatives for each safety flag, and for the priority the incident would get (Critical; High or Critical). */
export function errorRates(rows: Scored[], cases: Case[]) {
  const exp = (id: string) => cases.find((c) => c.id === id)!.expected;
  const flags = Object.fromEntries(FLAGS.map((f) => [f, confusion(rows.map((r) => ({ id: r.id, truth: exp(r.id)[f], pred: r.pred[f] })))])) as Record<(typeof FLAGS)[number], Confusion>;
  const level = (want: string[]) => confusion(rows.map((r) => ({ id: r.id, truth: want.includes(levelOf(exp(r.id))), pred: want.includes(levelOf(r.pred)) })));
  return { flags, critical: level(['CRITICAL']), urgent: level(['CRITICAL', 'HIGH']) };
}

export function printErrors(title: string, e: ReturnType<typeof errorRates>) {
  const pct = (x: number) => `${Math.round(100 * x)}%`;
  const row = (label: string, c: Confusion) =>
    `| ${label} | ${c.tp + c.fn} / ${c.n} | ${c.fp} | ${c.fn} | ${pct(c.falseAlarmRate)} | ${pct(c.missRate)} | ${c.precision.toFixed(2)} | ${c.recall.toFixed(2)} |`;
  console.log(`\n### ${title}: false positives and false negatives\n`);
  console.log('| What | really true | false positives | false negatives | false-alarm rate | miss rate | precision | recall |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const f of FLAGS) console.log(row(f, e.flags[f]));
  console.log(row('priority Critical', e.critical));
  console.log(row('priority High or Critical', e.urgent));
  for (const f of FLAGS) if (e.flags[f].fn) console.log(`  missed ${f}: ${e.flags[f].fnIds.join(', ')}`);
  if (e.critical.fn) console.log(`  missed Critical: ${e.critical.fnIds.join(', ')}`);
}
