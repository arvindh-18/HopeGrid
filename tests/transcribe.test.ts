// tests/transcribe.test.ts — the speech routing in server/transcribe.ts (BR-12) with stand-in engines: the real
// language choice, engine choice and fallbacks run (and the real ffmpeg); no model is loaded (AR-31).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  /** Whisper's language guess; null = it reports none. */
  detected: 'ta' as string | null,
  /** Model files that are "not installed" (matched against the path). */
  missing: [] as string[],
  indic: 'எங்கள் வீட்டில் தண்ணீர்' as string | Error,
  parakeet: 'Water entered our house' as string | Error,
  whisperText: 'whisper heard this',
  whisperEnglish: 'whisper english',
  ai: 'Water entered our house' as string | null | Error,
  /** Every engine call, in order. */
  calls: [] as string[],
}));

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const existsSync = (p: import('node:fs').PathLike) => !state.missing.some((m) => String(p).includes(m));
  return { ...fs, default: { ...fs, existsSync }, existsSync };
});

vi.mock('@fugood/whisper.node', () => {
  const done = <T>(value: T | Error) => ({
    stop: async () => {},
    promise: value instanceof Error ? Promise.reject(value) : Promise.resolve({ segments: [], isAborted: false, ...value }),
  });
  return {
    initWhisper: async () => ({
      transcribeData: (_pcm: ArrayBuffer, o: { language: string; translate: boolean; duration?: number }) => {
        const kind = o.duration ? 'detect' : o.translate ? 'translate' : 'hear';
        state.calls.push(`whisper:${kind}:${o.language}`);
        if (kind === 'detect') return done({ result: '', language: state.detected ?? undefined });
        if (kind === 'translate') return done({ result: state.whisperEnglish, language: o.language });
        return done({ result: state.whisperText, language: o.language === 'auto' ? state.detected ?? undefined : o.language });
      },
    }),
    initParakeet: async () => ({
      transcribeData: () => {
        state.calls.push('parakeet');
        return done(state.parakeet instanceof Error ? state.parakeet : { result: state.parakeet });
      },
    }),
  };
});

vi.mock('sherpa-onnx-node', () => ({
  default: {
    OfflineRecognizer: {
      createAsync: async (config: { modelConfig: { tokens: string } }) => ({
        createStream: () => ({ acceptWaveform: () => {} }),
        decodeAsync: async () => {
          state.calls.push(`indic:${config.modelConfig.tokens.includes('indicconformer-ta') ? 'ta' : 'hi'}`);
          if (state.indic instanceof Error) throw state.indic;
          return { text: state.indic };
        },
      }),
    },
  },
}));

vi.mock('../server/ai', () => ({
  translateToEnglish: async (_text: string, language: string) => {
    state.calls.push(`ai:${language}`);
    if (state.ai instanceof Error) throw state.ai;
    return state.ai;
  },
}));

/** Half a second of silence as a .wav file (ffmpeg really converts it; the engines are stand-ins). */
function silence(): Buffer {
  const pcm = Buffer.alloc(16000);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16000, 24);
  h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** A fresh server/transcribe.ts (its loaded-model caches start empty), run on one voice note. */
async function hear(hint: 'en' | 'ta' | 'hi' | null = null) {
  vi.resetModules();
  const { transcribeAudio } = await import('../server/transcribe');
  return transcribeAudio(silence(), 'wav', hint);
}

beforeEach(() => {
  Object.assign(state, {
    detected: 'ta', missing: [], indic: 'எங்கள் வீட்டில் தண்ணீர்', parakeet: 'Water entered our house',
    whisperText: 'whisper heard this', whisperEnglish: 'whisper english', ai: 'Water entered our house', calls: [],
  });
});

describe('BR-12 speech routing (server/transcribe.ts)', () => {
  it('Tamil: Whisper only guesses the language, IndicConformer hears it, the local AI writes the English', async () => {
    expect(await hear()).toEqual({ text: 'எங்கள் வீட்டில் தண்ணீர்', language: 'ta', english: 'Water entered our house', engine: 'INDICCONFORMER' });
    expect(state.calls).toEqual(['whisper:detect:auto', 'indic:ta', 'ai:ta']);
  });

  it('Hindi that Whisper hears as Urdu goes to the Hindi model', async () => {
    state.detected = 'ur';
    expect(await hear()).toMatchObject({ language: 'hi', engine: 'INDICCONFORMER' });
    expect(state.calls).toEqual(['whisper:detect:auto', 'indic:hi', 'ai:hi']);
  });

  it('English: Parakeet hears it and nothing is translated', async () => {
    state.detected = 'en';
    expect(await hear('ta')).toEqual({ text: 'Water entered our house', language: 'en', english: null, engine: 'PARAKEET' });
    expect(state.calls).toEqual(['whisper:detect:auto', 'parakeet']);
  });

  it('Whisper takes over, told the language, when IndicConformer fails or Parakeet is not installed', async () => {
    state.indic = new Error('onnxruntime crashed');
    expect(await hear()).toMatchObject({ text: 'whisper heard this', language: 'ta', english: 'Water entered our house', engine: 'WHISPER' });
    expect(state.calls).toEqual(['whisper:detect:auto', 'indic:ta', 'whisper:hear:ta', 'ai:ta']);

    state.calls = [];
    state.detected = 'en';
    state.missing = ['parakeet'];
    expect(await hear()).toMatchObject({ text: 'whisper heard this', language: 'en', engine: 'WHISPER' });
    expect(state.calls).toEqual(['whisper:detect:auto', 'whisper:hear:en']);
  });

  it("uses Whisper's translate pass when the local AI is unavailable or answers nothing", async () => {
    state.ai = new Error('AI model not installed');
    expect(await hear()).toMatchObject({ english: 'whisper english', engine: 'INDICCONFORMER' });
    expect(state.calls).toEqual(['whisper:detect:auto', 'indic:ta', 'ai:ta', 'whisper:translate:ta']);

    state.calls = [];
    state.ai = null;
    expect(await hear()).toMatchObject({ english: 'whisper english' });
  });

  it('another language in an English app: Whisper hears and translates it; the AI is not asked', async () => {
    state.detected = 'te';
    expect(await hear('en')).toEqual({ text: 'whisper heard this', language: 'te', english: 'whisper english', engine: 'WHISPER' });
    expect(state.calls).toEqual(['whisper:detect:auto', 'whisper:hear:te', 'whisper:translate:te']);
  });

  it("without Whisper, the app's Tamil still gets IndicConformer; with no hint either, it fails", async () => {
    state.missing = ['ggml-small'];
    expect(await hear('ta')).toMatchObject({ language: 'ta', engine: 'INDICCONFORMER', english: 'Water entered our house' });
    expect(state.calls).toEqual(['indic:ta', 'ai:ta']);

    await expect(hear(null)).rejects.toThrow(/not installed/);
  });

  it('throws when no engine hears anything (the pipeline then marks it FAILED)', async () => {
    state.indic = '';
    state.whisperText = '  ';
    await expect(hear()).rejects.toThrow('No speech recognised');
  });
});
