// eval/bench.ts — latency of the report pipeline's model steps on this machine: speech-to-text (+ English translation
// for non-English speech) and AI structuring, through the same functions the server uses (transcribeAudio,
// structureText). Test audio is synthetic: macOS text-to-speech (`say`) reading reports from eval/reports.jsonl.
// Usage: npx tsx eval/bench.ts [--runs 3]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';

const RUNS = Number(process.argv[process.argv.indexOf('--runs') + 1]) || 3;
const OUT = resolve('tmp/bench');

// One clip per language, read by a macOS voice for that language.
const CLIPS = [
  { id: 'E01', lang: 'en', voice: 'Aman' },     // en_IN
  { id: 'T01', lang: 'ta', voice: 'Vani' },     // ta_IN
  { id: 'H01', lang: 'hi', voice: 'Lekha' },    // hi_IN
];

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (t: number) => Math.round(performance.now() - t);

function memoryState() {
  try {
    const swap = execFileSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8' }).trim();
    return { totalGB: Math.round(os.totalmem() / 2 ** 30), freeGB: +(os.freemem() / 2 ** 30).toFixed(2), swap };
  } catch {
    return { totalGB: Math.round(os.totalmem() / 2 ** 30), freeGB: +(os.freemem() / 2 ** 30).toFixed(2) };
  }
}

async function main() {
  const reports = readFileSync(new URL('./reports.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { id: string; text: string });
  const result: Record<string, unknown> = {
    ranAt: new Date().toISOString(),
    machine: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, platform: `${os.platform()} ${os.release()}`, node: process.version },
    memoryBefore: memoryState(),
    runs: RUNS,
    synthetic: 'audio is macOS text-to-speech of eval/reports.jsonl sentences',
  };

  // GPU backend node-llama-cpp picked on this machine (metal / cuda / vulkan / false = CPU only).
  try {
    const { getLlama } = await import('node-llama-cpp');
    result.llamaGpu = (await getLlama()).gpu;
  } catch (e) {
    result.llamaGpu = `unknown (${e instanceof Error ? e.message : e})`;
  }

  // The AI model is loaded (and timed) first: speech now uses it for the English version of Tamil and Hindi (BR-12).
  const ai = await import('../server/ai');
  let aiLoadMs = 0;
  let aiError: unknown = null;
  try {
    const t = performance.now();
    await ai.loadAiModel();
    aiLoadMs = ms(t);
  } catch (e) {
    aiError = e;
  }

  // ---- speech-to-text
  const speech: Record<string, unknown>[] = [];
  const canSay = os.platform() === 'darwin';
  const { loadSpeechModels, transcribeAudio } = await import('../server/transcribe');
  let whisperLoadMs: number | null = null;
  let loaded = '';
  try {
    const t = performance.now();
    loaded = await loadSpeechModels(); // every installed engine (BR-12), as at server start
    whisperLoadMs = ms(t);
  } catch (e) {
    result.speech = { skipped: `speech model not available: ${e instanceof Error ? e.message : e}` };
  }
  if (whisperLoadMs !== null && !canSay) result.speech = { skipped: 'no macOS `say` to make test audio' };
  if (whisperLoadMs !== null && canSay) {
    mkdirSync(OUT, { recursive: true });
    for (const c of CLIPS) {
      const text = reports.find((r) => r.id === c.id)!.text;
      const file = resolve(OUT, `${c.id}.aiff`);
      if (!existsSync(file)) execFileSync('say', ['-v', c.voice, '-o', file, text]);
      const audio = readFileSync(file);
      const seconds = Number(execFileSync('afinfo', [file], { encoding: 'utf8' }).match(/estimated duration: ([\d.]+)/)?.[1] ?? NaN);
      const times: number[] = [];
      let last: unknown = null;
      for (let i = 0; i < RUNS; i++) {
        const t = performance.now();
        last = await transcribeAudio(audio, 'aiff');
        times.push(ms(t));
      }
      speech.push({ clip: c.id, lang: c.lang, voice: c.voice, audioSeconds: +seconds.toFixed(1), msPerRun: times, medianMs: median(times), output: last });
      console.log(`speech ${c.id} (${c.lang}, ${seconds.toFixed(1)} s audio): median ${median(times)} ms over ${RUNS} runs ${JSON.stringify(times)}`);
    }
    result.speech = { modelLoadMs: whisperLoadMs, models: loaded, clips: speech };
    console.log(`speech models load: ${whisperLoadMs} ms (${loaded})`);
  }

  // ---- AI structuring (same function the pipeline calls; falls back to keywords on error/timeout)
  try {
    if (aiError) throw aiError;
    const loadMs = aiLoadMs;
    const rows: Record<string, unknown>[] = [];
    for (const c of CLIPS) {
      const text = reports.find((r) => r.id === c.id)!.text;
      const times: number[] = [];
      const sources: string[] = [];
      for (let i = 0; i < RUNS; i++) {
        const t2 = performance.now();
        const r = await ai.structureText(text);
        times.push(ms(t2));
        sources.push(r.source);
      }
      rows.push({ report: c.id, lang: c.lang, msPerRun: times, medianMs: median(times), sources });
      console.log(`AI ${c.id} (${c.lang}): median ${median(times)} ms over ${RUNS} runs ${JSON.stringify(times)} sources ${sources.join(',')}`);
    }
    result.ai = { model: process.env.AI_MODEL || 'hf:Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M', modelLoadMs: loadMs, reports: rows };
    console.log(`AI model load: ${loadMs} ms`);
  } catch (e) {
    result.ai = { skipped: `AI model not available: ${e instanceof Error ? e.message : e}` };
  }

  result.memoryAfter = memoryState();
  mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  const file = new URL(`./results/bench-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(`llama GPU backend: ${String(result.llamaGpu)}; memory before ${JSON.stringify(result.memoryBefore)}`);
  console.log(`Full results: ${file.pathname}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
