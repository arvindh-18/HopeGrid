// src/components/VoiceRecorder.tsx — record / play / delete a voice note, max 60 s (features.md F03, BR-05).
// Real browser MediaRecorder; works offline. Returns base64 + mime + seconds.
import { useEffect, useRef, useState } from 'react';
import { MAX_AUDIO_SECONDS } from '../../shared/constants';
import { blobToBase64 } from '../lib/media';
import { IconMic, IconPause, IconPlay, IconStop, IconTrash } from './Icons';

export interface VoiceNote { base64: string; mime: string; seconds: number; url: string }

interface Props {
  value: VoiceNote | null;
  onChange: (v: VoiceNote | null) => void;
  /** Called on every recording start/stop, e.g. to start live dictation. */
  onRecordingChange?: (recording: boolean) => void;
  compact?: boolean;
  disabled?: boolean;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function VoiceRecorder({ value, onChange, onRecordingChange, compact, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError("Voice recording isn't supported here. You can use your keyboard's mic button instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const seconds = Math.min(MAX_AUDIO_SECONDS, Math.round((Date.now() - started.current) / 1000));
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        const base64 = await blobToBase64(blob);
        onChange({ base64, mime: blob.type || 'audio/webm', seconds: Math.max(1, seconds), url: URL.createObjectURL(blob) });
      };
      rec.start();
      recorder.current = rec;
      started.current = Date.now();
      setElapsed(0);
      setRecording(true);
      onRecordingChange?.(true);
      tick.current = setInterval(() => {
        const s = (Date.now() - started.current) / 1000;
        setElapsed(s);
        if (s >= MAX_AUDIO_SECONDS) stop();
      }, 250);
    } catch {
      setError("Microphone blocked — you can use your keyboard's mic button instead.");
    }
  }

  function stop() {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    recorder.current = null;
    setRecording(false);
    onRecordingChange?.(false);
  }

  function togglePlay() {
    if (!value) return;
    if (!audio.current) {
      audio.current = new Audio(value.url);
      audio.current.onended = () => setPlaying(false);
    }
    if (playing) { audio.current.pause(); setPlaying(false); }
    else { void audio.current.play(); setPlaying(true); }
  }

  function remove() {
    audio.current?.pause();
    audio.current = null;
    setPlaying(false);
    onChange(null);
  }

  if (value && !recording) {
    return (
      <div className={`flex items-center gap-3 rounded-full bg-[#e3eee3] ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
        <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause voice note' : 'Play voice note'} className="grid h-9 w-9 place-items-center rounded-full bg-white text-ink">
          {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
        </button>
        <span className="flex-1 text-[14px] text-success">Voice note saved <span className="tabular-nums">{fmt(value.seconds)}</span></span>
        {!compact && (
          <button type="button" onClick={start} className="text-[13px] text-ink underline-offset-2 hover:underline">Record again</button>
        )}
        <button type="button" onClick={remove} aria-label="Delete voice note" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-white hover:text-danger">
          <IconTrash size={16} />
        </button>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col">
        <button
          type="button" disabled={disabled} onClick={recording ? stop : start}
          aria-label={recording ? 'Stop recording' : 'Record a voice message'}
          className={`grid h-11 w-11 place-items-center rounded-full ${recording ? 'bg-danger text-white' : 'bg-canvas text-ink hover:bg-strong'} disabled:opacity-40`}
          style={recording ? { animation: 'pulse-ring 1.4s infinite' } : undefined}
        >
          {recording ? <IconStop size={18} /> : <IconMic size={18} />}
        </button>
        {error && <span className="sr-only" role="alert">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button" disabled={disabled} onClick={recording ? stop : start}
        className={`flex min-h-[56px] w-full items-center justify-center gap-3 rounded-full border text-[15px] font-medium transition-colors disabled:opacity-40 ${
          recording ? 'border-danger bg-danger text-white' : 'border-dark bg-white text-ink hover:bg-canvas'
        }`}
        style={recording ? { animation: 'pulse-ring 1.4s infinite' } : undefined}
      >
        {recording ? (
          <>
            <IconStop size={20} /> Tap to stop <span className="tabular-nums opacity-80">{fmt(elapsed)} / {fmt(MAX_AUDIO_SECONDS)}</span>
          </>
        ) : (
          <>
            <IconMic size={20} /> Tap to speak
          </>
        )}
      </button>
      {error && <p className="t-caption text-[#8a240d]" role="alert">{error}</p>}
    </div>
  );
}
