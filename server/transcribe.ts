// server/transcribe.ts — voice note → text (rules.md BR-12). whisper.cpp runs inside the server through
// @fugood/whisper.node (prebuilt, GPU when available) and ffmpeg comes from @ffmpeg-installer — nothing to install
// besides `npm install`. The ggml-small model (multilingual: Tamil, Hindi and ~11 more Indian languages, English,
// mixed) lives in models/ and is downloaded only by `npm run setup-ai`.
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { initWhisper, type WhisperContext } from '@fugood/whisper.node';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { WHISPER_TIMEOUT_MS } from '../shared/constants';

const run = promisify(execFile);
const TMP_DIR = resolve('tmp');
const WHISPER_MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin';
const PCM_MAX_BYTES = 32 * 1024 * 1024; // 16 kHz mono 16-bit: ~2 MB per minute, generous headroom
const modelPath = () => resolve(process.env.WHISPER_MODEL || 'models/ggml-small.bin');

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms))]);

/**
 * Path of the speech model in models/. Only `npm run setup-ai` downloads it (download = true); the server never
 * does, so machines without it mark voice notes as not transcribed and staff listen to them (BR-12).
 */
export async function ensureWhisperModelFile(download = false): Promise<string> {
  const path = modelPath();
  if (existsSync(path)) return path;
  if (!download) throw new Error('Speech model not installed (run `npm run setup-ai` on the server laptop)');
  await mkdir(dirname(path), { recursive: true });
  const res = await fetch(WHISPER_MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`Speech model download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let done = 0;
  let shown = -1;
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
  body.on('data', (chunk: Buffer) => {
    done += chunk.length;
    const pct = total ? Math.floor((done / total) * 100) : 0;
    if (pct >= shown + 10) { shown = pct; console.log(`  speech model ${pct}%`); }
  });
  const partial = `${path}.part`; // renamed only when complete, so an interrupted download is never used
  await pipeline(body, createWriteStream(partial));
  await rename(partial, path);
  return path;
}

let whisper: Promise<WhisperContext> | null = null;

/** Loads the speech model once. Called at server start so the first voice note is fast. */
export function loadWhisper(): Promise<WhisperContext> {
  if (!whisper) {
    whisper = (async () => initWhisper({ filePath: await ensureWhisperModelFile(), useGpu: true }))();
    whisper.catch(() => { whisper = null; }); // let the next voice note retry
  }
  return whisper;
}

// One model: voice notes are transcribed one at a time.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

export interface Transcript {
  /** What was said, in the language it was said in. */
  text: string;
  /** Whisper language code, e.g. 'ta', 'hi', 'en'. Null when unknown. */
  language: string | null;
  /** English translation for non-English speech (Whisper's translate task); null for English or if it failed. */
  english: string | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Download audio, convert to 16 kHz mono PCM, transcribe with language auto-detect. Non-English speech is also
 * translated to English (a second Whisper pass) so the AI, which is strongest in English, can structure it.
 * Throws when nothing could be transcribed; a failed translation only leaves `english` null.
 */
export async function transcribe(storagePath: string): Promise<Transcript> {
  const deadline = Date.now() + WHISPER_TIMEOUT_MS;
  const remaining = () => Math.max(1, deadline - Date.now());
  const input = resolve(TMP_DIR, `${randomUUID()}.${storagePath.split('.').pop() ?? 'webm'}`);
  await mkdir(TMP_DIR, { recursive: true });
  try {
    const { downloadBuffer } = await import('./storage'); // lazy: model setup must work before .env exists
    await writeFile(input, await downloadBuffer(storagePath));
    const { stdout } = await run(
      ffmpeg.path,
      ['-loglevel', 'error', '-i', input, '-ar', '16000', '-ac', '1', '-f', 's16le', '-'],
      { encoding: 'buffer', maxBuffer: PCM_MAX_BYTES, timeout: remaining() },
    );
    const pcm = stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.length) as ArrayBuffer;
    const context = await withTimeout(loadWhisper(), remaining(), 'Loading the speech model');
    return await exclusive(async () => {
      const pass = async (options: { language: string; translate: boolean }) => {
        const job = context.transcribeData(pcm.slice(0), { ...options, temperature: 0 });
        const timer = setTimeout(() => void job.stop(), remaining());
        try { return await job.promise; } finally { clearTimeout(timer); }
      };
      const heard = await pass({ language: 'auto', translate: false });
      if (heard.isAborted) throw new Error('Transcription timed out');
      const text = clean(heard.result);
      if (!text) throw new Error('No speech recognised');
      const language = heard.language || null;
      if (!language || language === 'en') return { text, language, english: null };
      try {
        const translated = await pass({ language, translate: true });
        const english = clean(translated.result);
        return { text, language, english: !translated.isAborted && english && english !== text ? english : null };
      } catch (e) {
        console.warn(`Translation to English failed: ${e instanceof Error ? e.message : e}`);
        return { text, language, english: null };
      }
    });
  } finally {
    await rm(input, { force: true });
  }
}
