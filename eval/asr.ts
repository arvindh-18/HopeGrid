// eval/asr.ts — `npm run eval:asr -- <command>`: compares speech-to-text engines on the same clips, for English, Tamil
// and Hindi (docs/evaluation.md). Nothing here is used by the server.
//
//   synth                 clips spoken by the Mac's own voices (Rishi en-IN, Vani ta-IN, Lekha hi-IN) → a smoke test,
//                         not evidence: synthetic speech is far cleaner than a person under stress
//   record <en|ta|hi>     read each sentence into the microphone (Enter = start/stop, s = skip, q = quit);
//                         `--mic N` picks the input (see `record --list`), `--redo` re-records existing clips
//   fleurs [n]            real recordings instead: the first n (default 25) test clips per language from Google's
//                         FLEURS dataset (people reading Wikipedia sentences; CC-BY-4.0), with their transcripts and,
//                         for Tamil and Hindi, the English sentence each was translated from (FLEURS is parallel),
//                         into eval/asr/clips-fleurs/ — streamed, so only ~10 MB per language is downloaded
//   compare [dir]         runs every engine on every clip in dir (default eval/asr/clips) and scores it against
//     [--noise dB]        dir/references.jsonl if present, else eval/asr/sentences.jsonl: word and character error
//     [--engines a,b]     rate, seconds per clip, wrong language, English chrF. --noise mixes in background noise at
//                         that signal-to-noise ratio; --engines runs only engines whose name contains a or b
//
// Engines: Whisper small (as the server ran before BR-12 routing: language auto-detected, then a translate pass; or
// told the language), Whisper large-v3-turbo (q5_0), NVIDIA Parakeet TDT 0.6B v3 (English), AI4Bharat IndicConformer
// through sherpa-onnx (Tamil and Hindi models), and the server's own path (server/transcribe.ts: language detection,
// routing, English version). Model files live in models/ (git-ignored); `npm run setup-ai` installs the ones the
// server uses.
/// <reference path="../server/sherpa-onnx-node.d.ts" />
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { initParakeet, initWhisper } from '@fugood/whisper.node';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import sherpa from 'sherpa-onnx-node';

const run = promisify(execFile);
type Lang = 'en' | 'ta' | 'hi';
const LANGS: Lang[] = ['en', 'ta', 'hi'];
interface Sentence { id: string; lang: Lang; text: string; english?: string }
const SENTENCES: Sentence[] = readFileSync(resolve('eval/asr/sentences.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const CLIP_RE = /^(en|ta|hi)-(\d+)\.(wav|m4a|mp3|webm|ogg|aac|aiff|caf|mp4)$/;
const idOf = (file: string) => file.replace(/\.[^.]+$/, '');

// ---------------------------------------------------------------- scoring

/** Lower case, no punctuation or [annotations], Hindi nukta and chandrabindu variants folded, single spaces. */
export function normalize(text: string): string {
  return text.normalize('NFC')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/़/g, '')          // nukta: तकलीफ़ = तकलीफ
    .replace(/ँ/g, 'ं')    // chandrabindu → anusvara: पाँच = पांच
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance<T>(a: T[], b: T[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Word and character error rates (edits ÷ reference length). */
export function errorRates(reference: string, hypothesis: string): { wer: number; cer: number } {
  const r = normalize(reference);
  const h = normalize(hypothesis);
  const rw = r.split(' ').filter(Boolean);
  const rc = Array.from(r.replace(/ /g, ''));
  return {
    wer: editDistance(rw, h.split(' ').filter(Boolean)) / Math.max(1, rw.length),
    cer: editDistance(rc, Array.from(h.replace(/ /g, ''))) / Math.max(1, rc.length),
  };
}

// ---------------------------------------------------------------- audio

async function pcm16(file: string): Promise<Buffer> {
  const { stdout } = await run(ffmpeg.path, ['-loglevel', 'error', '-i', file, '-ar', '16000', '-ac', '1', '-f', 's16le', '-'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}
const toFloat = (pcm: Buffer) => {
  const out = new Float32Array(pcm.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = pcm.readInt16LE(i * 2) / 32768;
  return out;
};
const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;

// ---------------------------------------------------------------- engines

interface Clip { id: string; lang: Lang; pcm: Buffer }
interface Hypothesis { text: string; seconds: number; language?: string | null; english?: string | null }
interface Engine {
  name: string;
  langs: Lang[];
  available: () => boolean;
  run: (clips: Clip[]) => Promise<Hypothesis[]>;
}

/** `before`: the server before BR-12 routing — language auto-detected, then a translate pass for non-English. */
function whisperEngine(name: string, file: string, mode: 'before' | 'told'): Engine {
  return {
    name,
    langs: LANGS,
    available: () => existsSync(file),
    run: async (clips) => {
      const ctx = await initWhisper({ filePath: file, useGpu: true });
      const out: Hypothesis[] = [];
      for (const c of clips) {
        const t0 = performance.now();
        const r = await ctx.transcribeData(toArrayBuffer(c.pcm), { language: mode === 'told' ? c.lang : 'auto', translate: false, temperature: 0 }).promise;
        const language = r.language ?? null;
        const english = mode === 'before' && language && language !== 'en'
          ? (await ctx.transcribeData(toArrayBuffer(c.pcm), { language, translate: true, temperature: 0 }).promise).result.trim()
          : undefined;
        out.push({ text: r.result, seconds: (performance.now() - t0) / 1000, language, english });
      }
      await ctx.release();
      return out;
    },
  };
}

function parakeetEngine(name: string, file: string): Engine {
  return {
    name,
    langs: ['en'],
    available: () => existsSync(file),
    run: async (clips) => {
      const ctx = await initParakeet({ filePath: file, useGpu: true });
      const out: Hypothesis[] = [];
      for (const c of clips) {
        const t0 = performance.now();
        const r = await ctx.transcribeData(toArrayBuffer(c.pcm), { maxThreads: 4 }).promise;
        out.push({ text: r.result, seconds: (performance.now() - t0) / 1000 });
      }
      await ctx.release();
      return out;
    },
  };
}

function indicEngine(name: string, dir: string, langs: Lang[]): Engine {
  const model = resolve(dir, 'model.int8.onnx');
  const tokens = resolve(dir, 'tokens.txt');
  return {
    name,
    langs,
    available: () => existsSync(model) && existsSync(tokens),
    run: async (clips) => {
      const recognizer = new sherpa.OfflineRecognizer({
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: { nemoCtc: { model }, tokens, numThreads: 4, provider: 'cpu', debug: 0 },
        decodingMethod: 'greedy_search',
      });
      return clips.map((c) => {
        const t0 = performance.now();
        const stream = recognizer.createStream();
        stream.acceptWaveform({ samples: toFloat(c.pcm), sampleRate: 16000 });
        recognizer.decode(stream);
        const text = String(recognizer.getResult(stream).text ?? '');
        return { text, seconds: (performance.now() - t0) / 1000 };
      });
    },
  };
}

/**
 * The server's own code path (server/transcribe.ts): language detection, routing, English version. `withAppLanguage`:
 * the app is in the language spoken (the usual case); otherwise no app language at all (the worst case).
 */
function serverEngine(name: string, withAppLanguage: boolean): Engine {
  return {
    name,
    langs: LANGS,
    available: () => existsSync(resolve('models/ggml-small.bin')),
    run: async (clips) => {
      const { transcribeAudio } = await import('../server/transcribe');
      const out: Hypothesis[] = [];
      for (const c of clips) {
        const t0 = performance.now();
        const r = await transcribeAudio(wav(c.pcm), 'wav', withAppLanguage ? c.lang : null).catch((e) => ({ text: `[failed: ${e instanceof Error ? e.message : e}]`, language: null, english: null }));
        out.push({ text: r.text, seconds: (performance.now() - t0) / 1000, language: r.language, english: r.english });
      }
      return out;
    },
  };
}

const ENGINES: Engine[] = [
  whisperEngine('whisper-small (before BR-12: auto language + translate)', resolve('models/ggml-small.bin'), 'before'),
  whisperEngine('whisper-small (language told)', resolve('models/ggml-small.bin'), 'told'),
  whisperEngine('whisper-turbo-q5 (language told)', resolve('models/ggml-large-v3-turbo-q5_0.bin'), 'told'),
  parakeetEngine('parakeet-tdt-0.6b-v3 q8_0', resolve('models/ggml-parakeet-tdt-0.6b-v3-q8_0.bin')),
  parakeetEngine('parakeet-tdt-0.6b-v3 q4_k', resolve('models/ggml-parakeet-tdt-0.6b-v3-q4_k.bin')),
  indicEngine('indicconformer-ta', resolve('models/indicconformer-ta'), ['ta']),
  indicEngine('indicconformer-hi', resolve('models/indicconformer-hi'), ['hi']),
  serverEngine('hopegrid server (routed, no app language)', false),
  serverEngine('hopegrid server (routed, app language = spoken)', true),
];

// ---------------------------------------------------------------- noise

/**
 * Background noise at a given signal-to-noise ratio: pink-ish noise (Paul Kellet's filter; rain, wind and traffic
 * are mostly low-frequency), seeded so every run mixes the same noise.
 */
export function withNoise(pcm: Buffer, snrDb: number, seed: number): Buffer {
  const n = pcm.length / 2;
  let speech = 0;
  for (let i = 0; i < n; i++) speech += pcm.readInt16LE(i * 2) ** 2;
  let state = seed >>> 0;
  const white = () => { state = (state * 1664525 + 1013904223) >>> 0; return (state / 2 ** 32) * 2 - 1; };
  const noise = new Float64Array(n);
  let b0 = 0, b1 = 0, b2 = 0, power = 0;
  for (let i = 0; i < n; i++) {
    const w = white();
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    noise[i] = b0 + b1 + b2 + w * 0.1848;
    power += noise[i] ** 2;
  }
  const k = Math.sqrt(speech / Math.max(1e-9, power)) / 10 ** (snrDb / 20);
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i * 2) + k * noise[i]))), i * 2);
  return out;
}

/** 16 kHz mono 16-bit PCM → a .wav file's bytes. */
function wav(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16000, 24);
  h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// ---------------------------------------------------------------- commands

/** chrF (character 1–6-grams, β = 2) over a whole set: how close machine English is to the reference translation. */
export function chrf(pairs: { reference: string; hypothesis: string }[]): number {
  const match = Array(6).fill(0), hypN = Array(6).fill(0), refN = Array(6).fill(0);
  const grams = (s: string, n: number) => {
    const m = new Map<string, number>();
    for (let i = 0; i + n <= s.length; i++) m.set(s.slice(i, i + n), (m.get(s.slice(i, i + n)) ?? 0) + 1);
    return m;
  };
  for (const { reference, hypothesis } of pairs) {
    const r = normalize(reference).replace(/ /g, '');
    const h = normalize(hypothesis).replace(/ /g, '');
    for (let n = 1; n <= 6; n++) {
      const rg = grams(r, n);
      for (const [g, c] of grams(h, n)) match[n - 1] += Math.min(c, rg.get(g) ?? 0);
      hypN[n - 1] += Math.max(0, h.length - n + 1);
      refN[n - 1] += Math.max(0, r.length - n + 1);
    }
  }
  const p = match.reduce((a, m, i) => a + (hypN[i] ? m / hypN[i] : 0), 0) / 6;
  const rc = match.reduce((a, m, i) => a + (refN[i] ? m / refN[i] : 0), 0) / 6;
  return p + rc ? (100 * 5 * p * rc) / (4 * p + rc) : 0;
}

async function compare(dir: string, args: string[]) {
  if (!existsSync(dir)) throw new Error(`No clips folder ${dir}. Run \`npm run eval:asr -- synth\` or \`record <lang>\` first.`);
  const snr = args.includes('--noise') ? Number(args[args.indexOf('--noise') + 1]) : null;
  const only = args.includes('--engines') ? args[args.indexOf('--engines') + 1].split(',') : null;
  const refFile = resolve(dir, 'references.jsonl');
  const references: Sentence[] = existsSync(refFile) ? readFileSync(refFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : SENTENCES;
  const byId = new Map(references.map((s) => [s.id, s]));
  const clips = readdirSync(dir).filter((f) => CLIP_RE.test(f) && byId.has(idOf(f))).sort();
  if (!clips.length) throw new Error(`No clips like ta-01.wav in ${dir}.`);
  const audio: Clip[] = await Promise.all(clips.map(async (f, k) => {
    const pcm = await pcm16(resolve(dir, f));
    return { id: idOf(f), lang: f.slice(0, 2) as Lang, pcm: snr === null ? pcm : withNoise(pcm, snr, k + 1) };
  }));
  console.log(`${clips.length} clips from ${dir}${snr === null ? '' : `, background noise at ${snr} dB SNR`}\n`);
  const engines = ENGINES.filter((e) => !only || only.some((o) => e.name.includes(o)));

  const rows: { engine: string; id: string; lang: Lang; reference: string; hypothesis: string; wer: number; cer: number; seconds: number; language?: string | null; english?: string | null }[] = [];
  for (const e of engines) {
    if (!e.available()) { console.log(`skip ${e.name}: model files missing`); continue; }
    const mine = audio.filter((a) => e.langs.includes(a.lang));
    if (!mine.length) continue;
    process.stdout.write(`running ${e.name} on ${mine.length} clips… `);
    const hyps = await e.run(mine);
    console.log('done');
    mine.forEach((a, k) => {
      const ref = byId.get(a.id)!.text;
      rows.push({ engine: e.name, id: a.id, lang: a.lang, reference: ref, hypothesis: hyps[k].text.trim(), ...errorRates(ref, hyps[k].text), seconds: hyps[k].seconds, language: hyps[k].language, english: hyps[k].english });
    });
  }

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = ['| Language | Engine | Clips | WER | CER | s / clip | Wrong language | English chrF |', '|---|---|---|---|---|---|---|---|'];
  for (const lang of LANGS) {
    for (const e of engines) {
      const r = rows.filter((x) => x.lang === lang && x.engine === e.name);
      if (!r.length) continue;
      const avg = (k: 'wer' | 'cer' | 'seconds') => r.reduce((s, x) => s + x[k], 0) / r.length;
      const wrong = r.some((x) => x.language) ? String(r.filter((x) => x.language && x.language !== lang).length) : '—';
      const translated = r.filter((x) => byId.get(x.id)!.english && x.english !== undefined);
      const english = lang !== 'en' && translated.length
        ? chrf(translated.map((x) => ({ reference: byId.get(x.id)!.english!, hypothesis: x.english ?? '' }))).toFixed(1) : '—';
      lines.push(`| ${lang} | ${e.name} | ${r.length} | ${pct(avg('wer'))} | ${pct(avg('cer'))} | ${avg('seconds').toFixed(2)} | ${wrong} | ${english} |`);
    }
  }
  console.log(`\n${lines.join('\n')}\n`);
  mkdirSync(resolve('eval/results'), { recursive: true });
  const out = resolve('eval/results', `asr-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(out, JSON.stringify({ clipsDir: dir, noiseSnrDb: snr, table: lines, rows }, null, 2));
  console.log(`Every clip's transcript per engine: ${out}`);
}

/** Reads a .tar stream entry by entry; `want` returns true when enough files are saved (the download stops). */
async function readTar(stream: AsyncIterable<Buffer>, onFile: (name: string, data: Buffer) => boolean): Promise<void> {
  let buf = Buffer.alloc(0);
  let need: { name: string; size: number } | null = null;
  for await (const chunk of stream) {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (!need) {
        if (buf.length < 512) break;
        const header = buf.subarray(0, 512);
        if (header.every((b) => b === 0)) return; // end of archive
        const field = (a: number, b: number) => header.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
        const prefix = field(345, 500);
        need = { name: (prefix ? `${prefix}/` : '') + field(0, 100), size: parseInt(field(124, 136).trim() || '0', 8) };
        buf = buf.subarray(512);
      }
      const padded = Math.ceil(need.size / 512) * 512;
      if (buf.length < padded) break;
      const done = onFile(need.name, buf.subarray(0, need.size));
      buf = buf.subarray(padded);
      need = null;
      if (done) return;
    }
  }
}

const FLEURS = 'https://huggingface.co/datasets/google/fleurs/resolve/main/data';

async function fleurs(n: number) {
  const dir = resolve('eval/asr/clips-fleurs');
  mkdirSync(dir, { recursive: true });
  const configs: Record<Lang, string> = { en: 'en_us', ta: 'ta_in', hi: 'hi_in' };
  const refs: Sentence[] = [];
  const index = async (lang: Lang) => (await (await fetch(`${FLEURS}/${configs[lang]}/test.tsv`)).text()).trim().split('\n').map((l) => l.split('\t'));
  const english = new Map((await index('en')).map((c) => [c[0], c[2]])); // sentence id → English (the source text)
  for (const lang of LANGS) {
    const base = `${FLEURS}/${configs[lang]}`;
    const rowsOf = await index(lang);
    const text = new Map(rowsOf.map((c) => [c[1], c[2]])); // file → what was said
    const sentence = new Map(rowsOf.map((c) => [c[1], c[0]])); // file → sentence id
    const abort = new AbortController();
    const res = await fetch(`${base}/audio/test.tar.gz`, { signal: abort.signal });
    if (!res.ok || !res.body) throw new Error(`FLEURS ${lang}: HTTP ${res.status}`);
    let saved = 0;
    const source = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
    const unzip = source.pipe(createGunzip());
    source.on('error', () => {}); // stopping early aborts the download on purpose
    unzip.on('error', () => {});
    try {
      await readTar(unzip, (name, data) => {
        const file = name.split('/').pop() ?? '';
        const said = text.get(file);
        if (!file.endsWith('.wav') || !said) return false;
        const id = `${lang}-${String(++saved).padStart(3, '0')}`;
        writeFileSync(resolve(dir, `${id}.wav`), data);
        const source = lang === 'en' ? undefined : english.get(sentence.get(file)!);
        refs.push({ id, lang, text: said.replace(/\s+/g, ' ').trim(), ...(source ? { english: source } : {}) });
        return saved >= n;
      });
    } finally {
      unzip.destroy();
      abort.abort(); // stop downloading the rest of the archive
    }
    console.log(`${lang}: ${saved} FLEURS clips`);
  }
  writeFileSync(resolve(dir, 'references.jsonl'), `${refs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  console.log(`Saved in ${dir}. Now: npm run eval:asr -- compare eval/asr/clips-fleurs`);
}

async function synth() {
  const dir = resolve('eval/asr/clips-synthetic');
  mkdirSync(dir, { recursive: true });
  const voice: Record<Lang, string> = { en: 'Rishi', ta: 'Vani', hi: 'Lekha' };
  for (const s of SENTENCES) {
    await run('say', ['-v', voice[s.lang], '-o', resolve(dir, `${s.id}.aiff`), s.text]);
  }
  console.log(`${SENTENCES.length} synthetic clips in ${dir}. Now: npm run eval:asr -- compare eval/asr/clips-synthetic`);
}

async function record(lang: Lang, args: string[]) {
  if (args.includes('--list')) {
    const r = await run(ffmpeg.path, ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', '']).catch((e) => e);
    console.log(String(r.stderr).split('\n').filter((l) => /audio devices|\] \[\d\]/.test(l)).join('\n'));
    return;
  }
  if (!LANGS.includes(lang)) throw new Error('Usage: npm run eval:asr -- record <en|ta|hi> [--mic N] [--redo]');
  const mic = args.includes('--mic') ? args[args.indexOf('--mic') + 1] : '0';
  const dir = resolve('eval/asr/clips');
  mkdirSync(dir, { recursive: true });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Recording ${lang} with microphone ${mic}. Speak naturally, at a normal distance. Enter = start, Enter again = stop.\n`);
  for (const s of SENTENCES.filter((x) => x.lang === lang)) {
    const file = resolve(dir, `${s.id}.wav`);
    if (existsSync(file) && !args.includes('--redo')) continue;
    console.log(`\n${s.id}:  ${s.text}`);
    const go = (await rl.question('  Enter to start (s = skip, q = quit) ')).trim().toLowerCase();
    if (go === 'q') break;
    if (go === 's') continue;
    const ff = spawn(ffmpeg.path, ['-loglevel', 'error', '-f', 'avfoundation', '-i', `:${mic}`, '-ac', '1', '-ar', '16000', '-y', file], { stdio: ['pipe', 'ignore', 'inherit'] });
    await rl.question('  ● recording… Enter to stop ');
    ff.stdin.write('q');
    await new Promise((r) => ff.on('close', r));
    console.log(`  saved ${s.id}.wav`);
  }
  rl.close();
  console.log(`\nDone. Compare with: npm run eval:asr -- compare`);
}

const [command = 'compare', ...rest] = process.argv.slice(2);
if (command === 'synth') await synth();
else if (command === 'record') await record(rest[0] as Lang, rest);
else if (command === 'fleurs') await fleurs(Number(rest[0]) || 25);
else if (command === 'compare') await compare(resolve(rest[0] && !rest[0].startsWith('--') ? rest[0] : 'eval/asr/clips'), rest);
else console.log('Commands: synth | fleurs [n] | record <en|ta|hi> [--mic N] [--redo] [--list] | compare [dir] [--noise dB] [--engines a,b]');
