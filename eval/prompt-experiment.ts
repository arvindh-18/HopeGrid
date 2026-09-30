// eval/prompt-experiment.ts — compares prompt variants for the local LLM on the labelled report sets, loading the
// model once. Used to test a fix for a type bias found by eval/run.ts, measured on a held-out set written before
// any variant was run on it (eval/heldout.jsonl). All data is synthetic (see eval/README.md).
// Usage: npx tsx eval/prompt-experiment.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { getLlama, LlamaChatSession, type ChatHistoryItem } from 'node-llama-cpp';
import { coerce, ensureAiModelFile, EXAMPLES, EXTRACTION_SCHEMA, SYSTEM_PROMPT } from '../server/ai';
import type { Extraction } from '../shared/types';
import { compare, FIELDS, percentile, readJsonl, summarise, type Case, type Scored } from './score';

// Three extra worked examples for categories the current examples don't show (medical, power, fire), written for
// this experiment — they are not taken from either evaluation set.
const EXTRA_EXAMPLES: { report: string; extraction: Extraction }[] = [
  {
    report: 'My uncle slipped in the bathroom, his arm is bleeding badly and he feels dizzy.',
    extraction: { type: 'MEDICAL', people: null, vulnerable: false, mobilityIssue: false, trapped: false, medical: true, danger: false, needs: ['MEDICAL'], places: [], summary: 'A man slipped at home and is bleeding badly from his arm and feels dizzy.' },
  },
  {
    report: 'No power in Kamaraj Nagar since 6 pm, the street lights are also off.',
    extraction: { type: 'POWER_OUTAGE', people: null, vulnerable: false, mobilityIssue: false, trapped: false, medical: false, danger: false, needs: [], places: ['Kamaraj Nagar'], summary: 'Power has been out in Kamaraj Nagar since 6 pm.' },
  },
  {
    report: 'रसोई में आग लग गई है और धुआं पूरे घर में फैल रहा है, घर में छोटे बच्चे हैं।',
    extraction: { type: 'FIRE', people: null, vulnerable: true, mobilityIssue: false, trapped: false, medical: false, danger: true, needs: [], places: [], summary: 'A kitchen fire is spreading smoke through a house where small children are present.' },
  },
];

const HINDI_PROMPT = SYSTEM_PROMPT.replace('(English, Tamil or mixed)', '(English, Tamil, Hindi or mixed)');

interface Variant { name: string; prompt: string; examples: typeof EXAMPLES; typeLast: boolean }
const VARIANTS: Variant[] = [
  { name: 'V0 current', prompt: SYSTEM_PROMPT, examples: EXAMPLES, typeLast: false },
  { name: 'V1 type last', prompt: SYSTEM_PROMPT, examples: EXAMPLES, typeLast: true },
  { name: 'V2 more examples', prompt: HINDI_PROMPT, examples: [...EXAMPLES, ...EXTRA_EXAMPLES], typeLast: false },
  { name: 'V3 type last + more examples', prompt: HINDI_PROMPT, examples: [...EXAMPLES, ...EXTRA_EXAMPLES], typeLast: true },
];

/** The same extraction with "type" moved after "summary" (so the model describes before it classifies). */
const reorder = (e: Extraction, typeLast: boolean) => {
  if (!typeLast) return e;
  const { type, ...rest } = e;
  return { ...rest, type };
};

async function main() {
  const sets = { reports: readJsonl<Case>(new URL('./reports.jsonl', import.meta.url)), heldout: readJsonl<Case>(new URL('./heldout.jsonl', import.meta.url)) };
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath: await ensureAiModelFile() });
  const context = await model.createContext({ contextSize: 4096 });
  const session = new LlamaChatSession({ contextSequence: context.getSequence() });
  const { type: typeProp, ...otherProps } = EXTRACTION_SCHEMA.properties;
  const grammars = {
    first: await llama.createGrammarForJsonSchema(EXTRACTION_SCHEMA),
    last: await llama.createGrammarForJsonSchema({ ...EXTRACTION_SCHEMA, properties: { ...otherProps, type: typeProp } } as unknown as typeof EXTRACTION_SCHEMA),
  };

  const results: Record<string, unknown> = { ranAt: new Date().toISOString(), gpu: llama.gpu, variants: {} };
  for (const v of VARIANTS) {
    const history: ChatHistoryItem[] = [
      { type: 'system', text: v.prompt },
      ...v.examples.flatMap((e): ChatHistoryItem[] => [
        { type: 'user', text: `<report>${e.report}</report>` },
        { type: 'model', response: [JSON.stringify(reorder(e.extraction, v.typeLast))] },
      ]),
    ];
    const perSet: Record<string, unknown> = {};
    for (const [setName, cases] of Object.entries(sets)) {
      const rows: Scored[] = [];
      for (const c of cases) {
        const t = performance.now();
        session.setChatHistory(history);
        let pred: Extraction;
        let source = 'AI';
        try {
          const answer = await session.prompt(`<report>${c.text}</report>`, {
            grammar: v.typeLast ? grammars.last : grammars.first, temperature: 0, signal: AbortSignal.timeout(120_000),
          });
          pred = coerce(JSON.parse(answer), c.text);
        } catch {
          source = 'ERROR';
          pred = coerce({}, c.text);
        }
        rows.push({ id: c.id, lang: c.lang, pred, ok: compare(pred, c.expected), source, ms: performance.now() - t });
      }
      const s = summarise(rows, cases);
      const all = s.table.all;
      perSet[setName] = { summary: s, errors: rows.filter((r) => r.source !== 'AI').map((r) => r.id), medianMs: Math.round(percentile(rows.map((r) => r.ms!), 50)), cases: rows };
      console.log(`${v.name.padEnd(30)} ${setName.padEnd(8)} n=${all.n}  ${FIELDS.map((f) => `${f}=${all[f].split(' ')[1]}`).join(' ')}  allFields=${all.allFields.split(' ')[1]}  needsF1=${s.needsMicro.f1.toFixed(2)}  median=${perSet[setName] && (perSet[setName] as { medianMs: number }).medianMs}ms`);
    }
    (results.variants as Record<string, unknown>)[v.name] = perSet;
  }

  mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  const file = new URL(`./results/prompt-experiment-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(`Full results: ${file.pathname}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
