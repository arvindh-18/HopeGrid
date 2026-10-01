// eval/run.ts — accuracy of the keyword extractor (BR-10) and of the local LLM path exactly as the server runs it
// (server/ai.ts structureText, BR-11) on a labelled report set, and precision/recall of duplicate detection (BR-40)
// on eval/duplicate-pairs.jsonl. All data is synthetic and author-written (see eval/README.md).
// Usage: npx tsx eval/run.ts [--data reports|heldout|english] [--no-llm]
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { DEMO_CENTER } from '../shared/constants';
import { keywordExtractor } from '../shared/keywordExtractor';
import { findDuplicate, type LinkIncident } from '../shared/linking';
import type { IncidentType } from '../shared/types';
import { compare, errorRates, GROUPS, percentile, printErrors, printTable, readJsonl, summarise, type Case, type Scored } from './score';

interface Side { type: IncidentType; text: string; north_m?: number; east_m?: number; noCoords?: boolean }
interface Pair { id: string; duplicate: boolean; scenario: string; minutesApart: number; a: Side; b: Side }

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const dataset = arg('--data') ?? 'reports';
const cases = readJsonl<Case>(new URL(`./${dataset}.jsonl`, import.meta.url));
const pairs = readJsonl<Pair>(new URL('./duplicate-pairs.jsonl', import.meta.url));

async function main() {
  const out: Record<string, unknown> = {
    ranAt: new Date().toISOString(),
    machine: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 2 ** 30), platform: `${os.platform()} ${os.release()}`, node: process.version },
    dataset: { file: `${dataset}.jsonl`, reports: cases.length, byLang: Object.fromEntries(GROUPS.filter((g) => g !== 'all').map((g) => [g, cases.filter((c) => c.lang === g).length])), pairs: pairs.length, synthetic: true },
  };
  console.log(`Synthetic dataset ${dataset}.jsonl: ${cases.length} reports; ${pairs.length} duplicate pairs. Machine: ${os.cpus()[0]?.model}`);

  // (a) keyword extractor
  const kw: Scored[] = cases.map((c) => {
    const pred = keywordExtractor(c.text);
    return { id: c.id, lang: c.lang, pred, ok: compare(pred, c.expected) };
  });
  const kwSummary = summarise(kw, cases);
  printTable('Keyword extractor (BR-10)', kwSummary);
  const kwErrors = errorRates(kw, cases);
  printErrors('Keyword extractor', kwErrors);
  out.keyword = { summary: kwSummary, errors: kwErrors, cases: kw };

  // (b) local LLM through server/ai.ts, exactly as the pipeline calls it (falls back to keywords on any error)
  if (process.argv.includes('--no-llm')) {
    out.llm = { skipped: 'disabled with --no-llm' };
    console.log('\nLLM: skipped (--no-llm).');
  } else {
    const ai = await import('../server/ai');
    const t0 = performance.now();
    let loadError: string | null = null;
    try {
      await ai.loadAiModel();
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
    if (loadError) {
      out.llm = { skipped: `model not available: ${loadError}` };
      console.log(`\nLLM: skipped — ${loadError}`);
    } else {
      const loadMs = performance.now() - t0;
      const llm: Scored[] = [];
      for (const c of cases) {
        const t = performance.now();
        const r = await ai.structureText(c.text);
        llm.push({ id: c.id, lang: c.lang, pred: r.extraction, ok: compare(r.extraction, c.expected), source: r.source, ms: performance.now() - t });
      }
      const s = summarise(llm, cases);
      const ms = llm.map((r) => r.ms!);
      const fallbacks = llm.filter((r) => r.source !== 'AI').map((r) => r.id);
      printTable(`Local LLM path (server/ai.ts, ${process.env.AI_MODEL || 'Qwen 2.5 3B Instruct Q4_K_M'})`, s);
      const llmErrors = errorRates(llm, cases);
      printErrors('Local LLM path', llmErrors);
      const timing = { modelLoadMs: Math.round(loadMs), perReportMs: { median: Math.round(percentile(ms, 50)), p90: Math.round(percentile(ms, 90)), max: Math.round(Math.max(...ms)), first: Math.round(ms[0]) } };
      console.log(`Fell back to keywords: ${fallbacks.length}/${llm.length}${fallbacks.length ? ` (${fallbacks.join(', ')})` : ''}`);
      console.log(`Timing: model load ${timing.modelLoadMs} ms; per report median ${timing.perReportMs.median} ms, p90 ${timing.perReportMs.p90} ms, max ${timing.perReportMs.max} ms (first ${timing.perReportMs.first} ms)`);
      out.llm = { model: process.env.AI_MODEL || 'hf:Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M', summary: s, errors: llmErrors, fallbacks, timing, cases: llm };
    }
  }

  // (c) duplicate detection (BR-40) on labelled pairs
  const t0 = Date.parse('2026-09-24T10:00:00Z');
  const cosLat = Math.cos((DEMO_CENTER.lat * Math.PI) / 180);
  const link = (id: string, s: Side, minutes: number): LinkIncident => ({
    id, code: id, type: s.type, status: 'NEW',
    lat: s.noCoords ? null : DEMO_CENTER.lat + (s.north_m ?? 0) / 111_320,
    lng: s.noCoords ? null : DEMO_CENTER.lng + (s.east_m ?? 0) / (111_320 * cosLat),
    createdAt: new Date(t0 + minutes * 60_000).toISOString(),
    places: keywordExtractor(s.text).places, // as the keyword path would extract them
    text: s.text,
    possibleDuplicateOf: null,
  });
  const dup = pairs.map((p) => {
    const a = link(`${p.id}-a`, p.a, 0);
    const b = link(`${p.id}-b`, p.b, p.minutesApart);
    const flagged = findDuplicate(b, [a, b])?.id === a.id;
    const outcome = flagged ? (p.duplicate ? 'TP' : 'FP') : p.duplicate ? 'FN' : 'TN';
    return { id: p.id, truth: p.duplicate, flagged, outcome, scenario: p.scenario };
  });
  const count = (o: string) => dup.filter((d) => d.outcome === o).length;
  const [tp, fp, fn, tn] = ['TP', 'FP', 'FN', 'TN'].map(count);
  const dupSummary = { tp, fp, fn, tn, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1) };
  console.log('\n### Duplicate detection (BR-40)\n');
  console.log(`Pairs ${pairs.length}: TP ${tp}, FP ${fp}, FN ${fn}, TN ${tn} → precision ${dupSummary.precision.toFixed(2)}, recall ${dupSummary.recall.toFixed(2)}`);
  for (const d of dup.filter((x) => x.outcome === 'FP' || x.outcome === 'FN')) console.log(`  ${d.outcome} ${d.id}: ${d.scenario}`);
  out.duplicates = { summary: dupSummary, pairs: dup };

  mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  const file = new URL(`./results/run-${dataset}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nFull results: ${file.pathname}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
