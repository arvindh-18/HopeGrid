// eval/score.ts — shared scoring for eval/run.ts and eval/prompt-experiment.ts: field-by-field comparison of an
// Extraction with the hand-written expected values, per language and overall.
import { readFileSync } from 'node:fs';
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
