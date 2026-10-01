// server/transcribe.ts — voice note → text (rules.md BR-12). Every engine runs inside the server; nothing to install
// besides `npm install`:
//  - AI4Bharat IndicConformer (sherpa-onnx-node) hears Tamil and Hindi. On real recordings it makes about half
//    (Tamil) and a seventh (Hindi) of Whisper's character errors, and is faster (docs/evaluation.md §5b).
//  - NVIDIA Parakeet TDT 0.6B v3 (@fugood/whisper.node) hears English: fewer errors than Whisper small (most of all
//    with background noise), as few as Whisper turbo, and 3× faster than small.
//  - whisper.cpp (same package, GPU when available) with ggml-small tells which language was spoken, hears any other
//    language, and takes over when another engine is missing or fails.
//  - The English version of Tamil and Hindi comes from the local AI (server/ai.ts), which translates the text better
//    than Whisper's translate mode; Whisper's is the fallback when the AI isn't installed.
// ffmpeg comes from @ffmpeg-installer. Model files live in models/ and are downloaded only by `npm run setup-ai`.
/// <reference path="./sherpa-onnx-node.d.ts" />
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { initParakeet, initWhisper, type ParakeetContext, type TranscribeResult, type WhisperContext } from '@fugood/whisper.node';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import sherpa, { type OfflineRecognizer } from 'sherpa-onnx-node';
import { WHISPER_TIMEOUT_MS } from '../shared/constants';
import { speechEngine, speechLanguage, type SpeechEngine } from '../shared/speech';
import type { SpeechLang } from '../shared/types';
import { translateToEnglish } from './ai';

const run = promisify(execFile);
const TMP_DIR = resolve('tmp');
const MODELS_DIR = resolve('models');
const WHISPER_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin';
const SAMPLE_RATE = 16_000;
const PCM_MAX_BYTES = 32 * 1024 * 1024; // 16 kHz mono 16-bit: ~2 MB per minute, generous headroom
const LANGUAGE_ID_MS = 1000; // Whisper listens to the first 30 s to guess the language, then writes out only this much
const INDIC_THREADS = 4;
const modelPath = () => resolve(process.env.WHISPER_MODEL || 'models/ggml-small.bin');
/**
 * NVIDIA Parakeet TDT 0.6B v3 (CC-BY-4.0) in whisper.cpp's format, 4-bit (q4_k): as accurate as the 8-bit file on the
 * evaluation clips and ~260 MB less memory. Pinned and checked like the models below.
 */
const PARAKEET_MODEL = {
  path: resolve(MODELS_DIR, 'ggml-parakeet-tdt-0.6b-v3-q4_k.bin'),
  url: 'https://huggingface.co/ggml-org/parakeet-GGUF/resolve/35156454d1a39de06863303dd209fd2bed6ee079/ggml-parakeet-tdt-0.6b-v3-q4_k.bin',
  sha256: '8b205b8b39c6535e153de6fb11c51db46125d45c4f16ba496fe41a0fe71b885e',
};

type IndicLang = 'ta' | 'hi';
const LANGUAGE_NAME: Record<IndicLang, string> = { ta: 'Tamil', hi: 'Hindi' };
/**
 * AI4Bharat IndicConformer (MIT), converted for sherpa-onnx (NeMo CTC head, int8). Pinned to one revision and
 * checked by SHA-256, so setup-ai always installs the files that were evaluated.
 */
const INDIC_MODELS: Record<IndicLang, { dir: string; url: string; sha256: Record<'model.int8.onnx' | 'tokens.txt', string> }> = {
  ta: {
    dir: 'indicconformer-ta',
    url: 'https://huggingface.co/csndhanasekar/sherpa-onnx-indicconformer-ta-int8/resolve/a41ba03ed8e489eda5e108cb49099b7c9cf83e8b',
    sha256: {
      'model.int8.onnx': 'dfedd42ca1a143fa0f08808b6b5d8f03d1a86e904d68375b335e39417128c0de',
      'tokens.txt': '61c6ad5e1d4b28ebbd38853209cf169bdc4dcd62cc32d9ec5185f3530371636d',
    },
  },
  hi: {
    dir: 'indicconformer-hi',
    url: 'https://huggingface.co/meetsync/indic-conformer-onnx-sherpa/resolve/e19ba0d2f49c243fe4ce79ae3334526a03e753ae',
    sha256: {
      'model.int8.onnx': 'b99a01834cd1a72cd9be682a0b9543df6b152ef7dfceba88d3dbf59fbb77075d',
      'tokens.txt': '743aeb755c4489bc734a6705578552b072ffb45055aeeb5db19ae7761a424882',
    },
  },
};

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const notInstalled = (what: string) => new Error(`${what} not installed (run \`npm run setup-ai\` on the server laptop)`);

/** Downloads url → path through a .part file, so an interrupted download is never used; checks SHA-256 if given. */
async function fetchFile(url: string, path: string, label: string, sha256?: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${label} download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = createHash('sha256');
  let done = 0;
  let shown = -1;
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    done += chunk.length;
    const pct = total ? Math.floor((done / total) * 100) : 0;
    if (total > 1_000_000 && pct >= shown + 10) { shown = pct; console.log(`  ${label} ${pct}%`); }
  });
  const partial = `${path}.part`;
  await pipeline(body, createWriteStream(partial));
  if (sha256 && hash.digest('hex') !== sha256) {
    await rm(partial, { force: true });
    throw new Error(`${label} download is damaged (checksum mismatch)`);
  }
  await rename(partial, path);
}

/**
 * Path of the Whisper model in models/. Only `npm run setup-ai` downloads it (download = true); the server never
 * does, so machines without it mark voice notes as not transcribed and staff listen to them (BR-12).
 */
export async function ensureWhisperModelFile(download = false): Promise<string> {
  const path = modelPath();
  if (existsSync(path)) return path;
  if (!download) throw notInstalled('Speech model');
  await fetchFile(WHISPER_MODEL_URL, path, 'speech model');
  return path;
}

/** Path of the English (Parakeet) model in models/; like the Whisper model, only setup-ai downloads it. */
export async function ensureParakeetModelFile(download = false): Promise<string> {
  if (existsSync(PARAKEET_MODEL.path)) return PARAKEET_MODEL.path;
  if (!download) throw notInstalled('English speech model');
  await fetchFile(PARAKEET_MODEL.url, PARAKEET_MODEL.path, 'English speech model', PARAKEET_MODEL.sha256);
  return PARAKEET_MODEL.path;
}

/** Paths of the Tamil or Hindi IndicConformer files in models/; like the Whisper model, only setup-ai downloads them. */
export async function ensureIndicModelFiles(lang: IndicLang, download = false): Promise<{ model: string; tokens: string }> {
  const m = INDIC_MODELS[lang];
  const path = (file: string) => resolve(MODELS_DIR, m.dir, file);
  for (const [file, sha256] of Object.entries(m.sha256)) {
    if (existsSync(path(file))) continue;
    if (!download) throw notInstalled(`${LANGUAGE_NAME[lang]} speech model`);
    await fetchFile(`${m.url}/${file}`, path(file), `${LANGUAGE_NAME[lang]} speech model`, sha256);
  }
  return { model: path('model.int8.onnx'), tokens: path('tokens.txt') };
}

let whisper: Promise<WhisperContext> | null = null;

/** Loads the Whisper model once. */
export function loadWhisper(): Promise<WhisperContext> {
  if (!whisper) {
    whisper = (async () => initWhisper({ filePath: await ensureWhisperModelFile(), useGpu: true }))();
    whisper.catch(() => { whisper = null; }); // let the next voice note retry
  }
  return whisper;
}

let parakeet: Promise<ParakeetContext> | null = null;

/** Loads the English model once. */
export function loadParakeet(): Promise<ParakeetContext> {
  if (!parakeet) {
    parakeet = (async () => initParakeet({ filePath: await ensureParakeetModelFile(), useGpu: true }))();
    parakeet.catch(() => { parakeet = null; });
  }
  return parakeet;
}

const indic = new Map<IndicLang, Promise<OfflineRecognizer>>();

/** Loads the Tamil or Hindi model once, off the main thread. */
export function loadIndic(lang: IndicLang): Promise<OfflineRecognizer> {
  let recognizer = indic.get(lang);
  if (!recognizer) {
    recognizer = (async () => {
      const { model, tokens } = await ensureIndicModelFiles(lang);
      return sherpa.OfflineRecognizer.createAsync({
        featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
        modelConfig: { nemoCtc: { model }, tokens, numThreads: INDIC_THREADS, provider: 'cpu', debug: 0 },
        decodingMethod: 'greedy_search',
      });
    })();
    recognizer.catch(() => indic.delete(lang)); // let the next voice note retry
    indic.set(lang, recognizer);
  }
  return recognizer;
}

/**
 * Loads every installed speech model at server start, so the first voice note is fast. Resolves with what loaded;
 * rejects only when none is installed.
 */
export async function loadSpeechModels(): Promise<string> {
  const models = [
    ['Whisper', loadWhisper()], ['Parakeet English', loadParakeet()],
    ['IndicConformer Tamil', loadIndic('ta')], ['IndicConformer Hindi', loadIndic('hi')],
  ] as const;
  const loaded = await Promise.allSettled(models.map(([, p]) => p));
  const names = models.filter((_, i) => loaded[i].status === 'fulfilled').map(([name]) => name);
  if (!names.length) throw (loaded[0] as PromiseRejectedResult).reason;
  const missing = models.filter((_, i) => loaded[i].status === 'rejected').map(([name]) => name);
  return `${names.join(', ')}${missing.length ? ` (not installed: ${missing.join(', ')})` : ''}`;
}

// The engines take turns: one voice note at a time.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

export interface Transcript {
  /** What was said, in the language it was said in. */
  text: string;
  /** Language code, e.g. 'ta', 'hi', 'en' (or Whisper's code for another language). Null when unknown. */
  language: string | null;
  /** English version of non-English speech; null for English or if it failed. */
  english: string | null;
  /** Which engine heard it (BR-12). */
  engine: SpeechEngine;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Whisper marks non-speech with tags like [BLANK_AUDIO] or [MUSIC]: drop them, so silence counts as nothing heard. */
const spoken = (s: string) => clean(s.replace(/\[[^\]]*\]/g, ' '));

/**
 * Download a voice note from Storage and transcribe it (transcribeAudio). `hint` is the language the person used the
 * app in. The 60 s limit includes the download.
 */
export async function transcribe(storagePath: string, hint: SpeechLang | null = null): Promise<Transcript> {
  const deadline = Date.now() + WHISPER_TIMEOUT_MS;
  const { downloadBuffer } = await import('./storage'); // lazy: model setup must work before .env exists
  return transcribeAudio(await downloadBuffer(storagePath), storagePath.split('.').pop() ?? 'webm', hint, deadline);
}

/** Audio bytes in any format → 16 kHz mono signed 16-bit PCM (ffmpeg). */
async function toPcm(audio: Buffer, ext: string, ms: number): Promise<Buffer> {
  const input = resolve(TMP_DIR, `${randomUUID()}.${ext}`);
  await mkdir(TMP_DIR, { recursive: true });
  try {
    await writeFile(input, audio);
    const { stdout } = await run(
      ffmpeg.path,
      ['-loglevel', 'error', '-i', input, '-ar', String(SAMPLE_RATE), '-ac', '1', '-f', 's16le', '-'],
      { encoding: 'buffer', maxBuffer: PCM_MAX_BYTES, timeout: ms },
    );
    return stdout;
  } finally {
    await rm(input, { force: true });
  }
}

type Pass = { language: string; translate: boolean; duration?: number; temperatureInc?: number };
async function whisperPass(context: WhisperContext, pcm: Buffer, options: Pass, remaining: () => number): Promise<TranscribeResult> {
  const data = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length) as ArrayBuffer;
  const job = context.transcribeData(data, { ...options, temperature: 0 });
  const timer = setTimeout(() => void job.stop(), remaining());
  try { return await job.promise; } finally { clearTimeout(timer); }
}

async function hearParakeet(pcm: Buffer, remaining: () => number): Promise<string> {
  const context = await withTimeout(loadParakeet(), remaining(), 'Loading the speech model');
  const job = context.transcribeData(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length) as ArrayBuffer, { maxThreads: 4 });
  const timer = setTimeout(() => void job.stop(), remaining());
  try {
    const heard = await job.promise;
    return heard.isAborted ? '' : clean(heard.result);
  } finally {
    clearTimeout(timer);
  }
}

async function hearIndic(lang: IndicLang, pcm: Buffer, remaining: () => number): Promise<string> {
  const recognizer = await withTimeout(loadIndic(lang), remaining(), 'Loading the speech model');
  const samples = new Float32Array(pcm.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
  const stream = recognizer.createStream();
  stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
  return clean((await withTimeout(recognizer.decodeAsync(stream), remaining(), 'Transcription')).text ?? '');
}

/**
 * BR-12, three steps:
 * 1. Which language: Whisper's guess from the first 30 s, checked against the app's language (shared/speech.ts).
 * 2. Hear it: IndicConformer for Tamil and Hindi, Parakeet for English, Whisper told the language for the rest.
 *    Whisper takes over if the chosen engine is missing, fails or hears nothing.
 * 3. English version of non-English speech: the local AI translates Tamil and Hindi; Whisper's translate mode
 *    otherwise, or if the AI isn't available.
 * Throws when nothing could be transcribed; a failed translation only leaves `english` null.
 */
export async function transcribeAudio(audio: Buffer, ext: string, hint: SpeechLang | null = null, deadline = Date.now() + WHISPER_TIMEOUT_MS): Promise<Transcript> {
  const remaining = () => Math.max(1, deadline - Date.now());
  const pcm = await toPcm(audio, ext, remaining());
  const context = await withTimeout(loadWhisper(), remaining(), 'Loading the speech model').catch((e) => {
    console.warn(`Whisper unavailable: ${message(e)}`);
    return null;
  });

  const detected = context
    ? await exclusive(() => whisperPass(context, pcm, { language: 'auto', translate: false, duration: LANGUAGE_ID_MS, temperatureInc: 0 }, remaining))
      .then((r) => r.language || null, (e) => { console.warn(`Language detection failed: ${message(e)}`); return null; })
    : null;
  const lang = speechLanguage(detected, hint);
  let language: string | null = lang ?? detected;

  let text = '';
  let engine = speechEngine(lang);
  if (engine !== 'WHISPER') {
    text = await exclusive(() => (engine === 'PARAKEET' ? hearParakeet(pcm, remaining) : hearIndic(lang as IndicLang, pcm, remaining)))
      .catch((e) => { console.warn(`${engine} failed, using Whisper: ${message(e)}`); return ''; });
    if (!text) engine = 'WHISPER';
  }
  if (engine === 'WHISPER') {
    if (!context) throw notInstalled('Speech model');
    const heard = await exclusive(() => whisperPass(context, pcm, { language: language ?? 'auto', translate: false }, remaining));
    if (heard.isAborted) throw new Error('Transcription timed out');
    text = spoken(heard.result);
    language ??= heard.language || null;
  }
  if (!text) throw new Error('No speech recognised');
  if (!language || language === 'en') return { text, language, english: null, engine };

  let english: string | null = null;
  if (language === 'ta' || language === 'hi') {
    english = await translateToEnglish(text, language)
      .catch((e) => { console.warn(`AI translation unavailable, using Whisper's: ${message(e)}`); return null; });
  }
  if (!english && context) {
    const translated = await exclusive(() => whisperPass(context, pcm, { language, translate: true }, remaining))
      .catch((e) => { console.warn(`Translation to English failed: ${message(e)}`); return null; });
    const heard = translated && !translated.isAborted ? spoken(translated.result) : '';
    english = heard && heard !== text ? heard : null;
  }
  return { text, language, english, engine };
}
