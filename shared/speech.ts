// shared/speech.ts — which speech engine hears a voice note (rules.md BR-12). Pure, so the rules are unit-tested; the
// engines themselves run in server/transcribe.ts.
import { SPEECH_LANGS, type SpeechLang } from './types';

export const isSpeechLang = (x: unknown): x is SpeechLang => (SPEECH_LANGS as readonly unknown[]).includes(x);

/**
 * Whisper's language guess mixes up close neighbours: on real recordings it heard Hindi as Urdu and Tamil as
 * Malayalam, and never confused Tamil, Hindi and English with each other (docs/evaluation.md §5b).
 */
const NEIGHBOUR: Record<string, SpeechLang> = { ur: 'hi', ml: 'ta' };

/**
 * BR-12: the language a voice note is in. `detected` is Whisper's guess (null when Whisper isn't installed or found
 * no speech); `hint` is the language the person used the app in (null for older apps). Returns null for another
 * language, which Whisper then transcribes as it is.
 */
export function speechLanguage(detected: string | null, hint: SpeechLang | null): SpeechLang | null {
  const heard = detected ? NEIGHBOUR[detected] ?? detected : null;
  if (isSpeechLang(heard)) return heard;
  if (hint === 'ta' || hint === 'hi') return hint; // Whisper heard some other language, but the person chose Tamil or Hindi
  return detected ? null : hint;
}

export type SpeechEngine = 'INDICCONFORMER' | 'PARAKEET' | 'WHISPER';

/**
 * BR-12: Tamil and Hindi go to AI4Bharat's IndicConformer (the most accurate measured), English to NVIDIA's Parakeet
 * (as accurate as Whisper turbo, much faster; docs/evaluation.md §5b); any other language to Whisper.
 */
export function speechEngine(lang: SpeechLang | null): SpeechEngine {
  if (lang === 'ta' || lang === 'hi') return 'INDICCONFORMER';
  return lang === 'en' ? 'PARAKEET' : 'WHISPER';
}

/**
 * A model's English translation, tidied: no wrapping quotes or "Translation:" label. Null when there is nothing
 * useful (empty, or the same as the original).
 */
export function cleanTranslation(answer: string, original: string): string | null {
  const s = answer
    .replace(/<\/?text>/g, ' ')
    .replace(/^\s*(english( translation)?|translation)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“‘](.*)["'”’]$/s, '$1')
    .trim();
  return s && s !== original.trim() ? s : null;
}
