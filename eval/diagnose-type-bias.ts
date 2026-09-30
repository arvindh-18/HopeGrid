// eval/diagnose-type-bias.ts — the check behind docs/evaluation.md §3: for four reports the AI mislabels, compare the
// answer with the JSON grammar (production), without it, and with "type" asked after the summary. Synthetic data.
// Usage: npx tsx eval/diagnose-type-bias.ts
import { getLlama, LlamaChatSession, type ChatHistoryItem } from 'node-llama-cpp';
import { EXAMPLES, EXTRACTION_SCHEMA, SYSTEM_PROMPT, ensureAiModelFile } from '../server/ai';
const cases: [string, string, string][] = [
  ['H10 fever (hi)', 'MEDICAL', 'मेरी माँ को तेज़ बुखार है और साँस लेने में तकलीफ़ है, दवा चाहिए।'],
  ['E11 gas+asthma', 'MEDICAL', 'Gas cylinder leak in flat 3B, strong smell on the whole floor. My father has asthma and is struggling to breathe.'],
  ['T04 power (ta)', 'POWER_OUTAGE', 'நேற்று இரவு முதல் எங்கள் பகுதியில் மின்சாரம் இல்லை.'],
  ['E04 fall+bleeding', 'MEDICAL', 'My neighbour fell from a ladder and is bleeding from the head, he is unconscious. We are at 14 Lake View Street.'],
];
const llama = await getLlama();
const model = await llama.loadModel({ modelPath: await ensureAiModelFile() });
const ctx = await model.createContext({ contextSize: 4096 });
const session = new LlamaChatSession({ contextSequence: ctx.getSequence() });
const history: ChatHistoryItem[] = [{ type: 'system', text: SYSTEM_PROMPT }, ...EXAMPLES.flatMap((e): ChatHistoryItem[] => [
  { type: 'user', text: `<report>${e.report}</report>` }, { type: 'model', response: [JSON.stringify(e.extraction)] }])];
const typeFirst = await llama.createGrammarForJsonSchema(EXTRACTION_SCHEMA);
const { type: typeProp, ...rest } = EXTRACTION_SCHEMA.properties;
const typeLast = await llama.createGrammarForJsonSchema({ ...EXTRACTION_SCHEMA, properties: { ...rest, type: typeProp }, required: [...EXTRACTION_SCHEMA.required.filter((k) => k !== 'type'), 'type'] } as never);
for (const [name, want, text] of cases) {
  const out: string[] = [];
  for (const [label, grammar] of [['grammar, type first (current)', typeFirst], ['no grammar', undefined], ['grammar, type last', typeLast]] as const) {
    session.setChatHistory(history);
    const a = await session.prompt(`<report>${text}</report>`, { grammar: grammar as never, temperature: 0, maxTokens: 300 });
    const m = a.match(/"type"\s*:\s*"([A-Z_]+)"/);
    out.push(`${label}: ${m?.[1] ?? '(no type) ' + a.slice(0, 60)}`);
  }
  console.log(`${name} — expected ${want}\n   ${out.join('\n   ')}`);
}
process.exit(0);
