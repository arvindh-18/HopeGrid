// tests/integration/stubs.ts — stand-ins for the local LLM and Whisper so API tests never run a model (AR-31).
// The LLM stub replaces only the node-llama-cpp calls server/ai.ts makes, so ai.ts's real prompt flow, coerce()
// (BR-11) and keyword fallback (BR-10) still run. Whisper is stubbed at server/transcribe.ts.
import type { Transcript } from '../../server/transcribe';

/** What the stub model answers. `null` → the model call throws, like a crash or timeout (→ keyword fallback). */
export const llm: { answer: unknown; prompts: string[] } = { answer: null, prompts: [] };

class LlamaChatSession {
  setChatHistory(): void {}
  async prompt(text: string): Promise<string> {
    llm.prompts.push(text);
    if (llm.answer === null) throw new Error('stub model failed');
    return typeof llm.answer === 'string' ? llm.answer : JSON.stringify(llm.answer);
  }
}

export const nodeLlamaCppStub = {
  getLlama: async () => ({
    loadModel: async () => ({ createContext: async () => ({ getSequence: () => ({}) }) }),
    createGrammarForJsonSchema: async () => ({}),
  }),
  resolveModelFile: async () => '/stub/model.gguf',
  LlamaChatSession,
};

/**
 * What the stub speech engine returns for a voice note; `hints` records the app language each call was given. A
 * string in `error` makes it fail; `gate` holds it until resolved.
 */
export const speech: { result: Transcript; error: string | null; calls: string[]; hints: (string | null)[]; gate: Promise<void> | null } = {
  result: { text: 'stub transcript', language: 'en', english: null, engine: 'PARAKEET' },
  error: null,
  calls: [],
  hints: [],
  gate: null,
};

export const transcribeStub = {
  transcribe: async (storagePath: string, hint: string | null = null): Promise<Transcript> => {
    speech.calls.push(storagePath);
    speech.hints.push(hint);
    if (speech.gate) await speech.gate;
    if (speech.error) throw new Error(speech.error);
    return speech.result;
  },
  loadWhisper: async () => ({}),
  loadSpeechModels: async () => 'stub',
  ensureWhisperModelFile: async () => '/stub/ggml-small.bin',
};

export function resetStubs(): void {
  llm.answer = null;
  llm.prompts = [];
  speech.result = { text: 'stub transcript', language: 'en', english: null, engine: 'PARAKEET' };
  speech.error = null;
  speech.calls = [];
  speech.hints = [];
  speech.gate = null;
}
