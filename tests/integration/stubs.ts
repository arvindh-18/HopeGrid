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

/** What the stub Whisper returns for a voice note. A string in `error` makes it fail; `gate` holds it until resolved. */
export const speech: { result: Transcript; error: string | null; calls: string[]; gate: Promise<void> | null } = {
  result: { text: 'stub transcript', language: 'en', english: null },
  error: null,
  calls: [],
  gate: null,
};

export const transcribeStub = {
  transcribe: async (storagePath: string): Promise<Transcript> => {
    speech.calls.push(storagePath);
    if (speech.gate) await speech.gate;
    if (speech.error) throw new Error(speech.error);
    return speech.result;
  },
  loadWhisper: async () => ({}),
  ensureWhisperModelFile: async () => '/stub/ggml-small.bin',
};

export function resetStubs(): void {
  llm.answer = null;
  llm.prompts = [];
  speech.result = { text: 'stub transcript', language: 'en', english: null };
  speech.error = null;
  speech.calls = [];
  speech.gate = null;
}
