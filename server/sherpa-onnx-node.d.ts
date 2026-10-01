// server/sherpa-onnx-node.d.ts — the part of sherpa-onnx-node (no types of its own) that server/transcribe.ts uses:
// offline recognition with a NeMo CTC model (AI4Bharat IndicConformer), created and decoded off the main thread.
declare module 'sherpa-onnx-node' {
  export interface OfflineRecognizerConfig {
    featConfig: { sampleRate: number; featureDim: number };
    modelConfig: { nemoCtc: { model: string }; tokens: string; numThreads: number; provider: 'cpu'; debug: 0 | 1 };
    decodingMethod: 'greedy_search';
  }
  export interface OfflineStream {
    acceptWaveform(wave: { samples: Float32Array; sampleRate: number }): void;
  }
  export class OfflineRecognizer {
    constructor(config: OfflineRecognizerConfig);
    static createAsync(config: OfflineRecognizerConfig): Promise<OfflineRecognizer>;
    createStream(): OfflineStream;
    decode(stream: OfflineStream): void;
    decodeAsync(stream: OfflineStream): Promise<{ text: string }>;
    getResult(stream: OfflineStream): { text: string };
  }
  const sherpa: { OfflineRecognizer: typeof OfflineRecognizer };
  export default sherpa;
}
