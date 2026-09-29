// src/hooks/useLiveDictation.ts — optional live speech-to-text while speaking (features.md F24).
// Online only; hidden when the browser has no SpeechRecognition. Never required for F03.
// Starts in the app's language (F25): en-IN, ta-IN or hi-IN.
import { useCallback, useEffect, useRef, useState } from 'react';
import { LANGS, useI18n } from '../i18n';
import { useOnline } from '../offline/useOnline';

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start(): void; stop(): void;
};

function getCtor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useLiveDictation(onText: (text: string) => void) {
  const online = useOnline();
  const supported = !!getCtor() && online;
  const { lang: uiLang } = useI18n();
  const speechFor = (code: string) => LANGS.find((l) => l.code === code)?.speech ?? 'en-IN';
  const [lang, setLang] = useState<string>(() => speechFor(uiLang));
  useEffect(() => setLang(speechFor(uiLang)), [uiLang]);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => {
    rec.current?.stop();
    rec.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) cb.current(e.results[i][0].transcript.trim());
      }
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    rec.current = r;
    setListening(true);
  }, [lang]);

  useEffect(() => stop, [stop]);
  return { supported, listening, start, stop, lang, setLang };
}
