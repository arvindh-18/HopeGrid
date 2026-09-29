// src/components/ChatBox.tsx — private volunteer ↔ victim chat (features.md F17, rules.md BR-70…BR-73).
// Shows labels only ("You", "Volunteer", "Reporter 1"); never names or phone numbers.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, ChatThread, MessageSender, OutgoingMessage } from '../../shared/types';
import { getPosition, mapsLink } from '../lib/geo';
import { useOnline } from '../offline/useOnline';
import { IconExternal, IconPin, IconSend } from './Icons';
import { Spinner, clockTime } from './ui';
import { VoiceRecorder, type VoiceNote } from './VoiceRecorder';

type Viewer = 'VICTIM' | 'VOLUNTEER' | 'ADMIN';

interface Props {
  threads: ChatThread[];
  open: boolean;
  viewer: Viewer;
  onSend?: (reportId: string, msg: OutgoingMessage) => Promise<void>;
  quickReplies?: string[];
  allowShareLocation?: boolean;
  emptyText?: string;
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.15);
  } catch { /* audio not allowed yet */ }
}

export function ChatBox({ threads, open, viewer, onSend, quickReplies = [], allowShareLocation, emptyText }: Props) {
  const online = useOnline();
  const [active, setActive] = useState(threads[0]?.reportId ?? '');
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const readOnly = viewer === 'ADMIN' || !onSend;

  useEffect(() => {
    if (!threads.some((t) => t.reportId === active) && threads[0]) setActive(threads[0].reportId);
  }, [threads, active]);

  const thread = threads.find((t) => t.reportId === active) ?? threads[0];
  const messages = thread?.messages ?? [];

  // Incoming = messages not sent by this viewer. Alert when the count grows after first render.
  const mine: MessageSender | null = viewer === 'ADMIN' ? null : viewer;
  const incoming = useMemo(() => threads.flatMap((t) => t.messages).filter((m) => m.sender !== mine).length, [threads, mine]);
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (seen.current !== null && incoming > seen.current && viewer !== 'ADMIN') {
      (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive && navigator.vibrate?.(200);
      beep();
    }
    seen.current = incoming;
  }, [incoming, viewer]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, active]);

  const label = (m: ChatMessage): string => {
    if (viewer === 'ADMIN') return m.sender === 'VOLUNTEER' ? 'Volunteer' : thread?.label ?? 'Reporter';
    if (m.sender === viewer) return 'You';
    return m.sender === 'VOLUNTEER' ? 'Volunteer' : thread?.label ?? 'Reporter';
  };

  async function send(msg: OutgoingMessage) {
    if (!onSend || !thread) return;
    if (!online) {
      setError("You're offline — message not sent.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSend(thread.reportId, msg);
      setText('');
      setVoice(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message not sent.');
    } finally {
      setSending(false);
    }
  }

  async function shareLocation() {
    try {
      const p = await getPosition();
      await send({ lat: p.lat, lng: p.lng });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Location is not available.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {threads.length > 1 && (
        <div role="tablist" className="flex gap-1 rounded-full bg-canvas p-1">
          {threads.map((t) => (
            <button
              key={t.reportId} role="tab" type="button" aria-selected={t.reportId === thread?.reportId}
              onClick={() => setActive(t.reportId)}
              className={`flex-1 rounded-full px-3 py-2 text-[14px] ${t.reportId === thread?.reportId ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {t.label} {t.messages.length > 0 && <span className="text-muted">({t.messages.length})</span>}
            </button>
          ))}
        </div>
      )}

      <div ref={listRef} className="flex max-h-[360px] min-h-[120px] flex-col gap-2 overflow-y-auto rounded-[12px] bg-canvas p-3" aria-live="polite">
        {messages.length === 0 && (
          <p className="m-auto max-w-xs text-center t-body-sm text-muted">
            {emptyText ?? (open ? 'No messages yet. Say where you are or what you need.' : 'No messages were sent.')}
          </p>
        )}
        {messages.map((m) => {
          const own = viewer !== 'ADMIN' && m.sender === viewer;
          return (
            <div key={m.id} className={`flex max-w-[85%] flex-col gap-1 ${own ? 'self-end items-end' : 'self-start items-start'}`}>
              <span className="t-caption">{label(m)}, {clockTime(m.createdAt)}</span>
              <div className={`rounded-[14px] px-3.5 py-2 text-[15px] ${own ? 'bg-dark text-white' : 'bg-white text-body'}`}>
                {m.lat !== null && m.lng !== null ? (
                  <a href={mapsLink(m.lat, m.lng)} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 ${own ? 'text-lime' : 'text-link'}`}>
                    <IconPin size={16} /> Location shared — Open in Maps <IconExternal size={14} />
                  </a>
                ) : (
                  m.text && <p className="whitespace-pre-wrap">{m.text}</p>
                )}
                {m.audioUrl && <audio controls src={m.audioUrl} className="mt-1 h-9 max-w-[240px]" />}
              </div>
            </div>
          );
        })}
      </div>

      {readOnly ? (
        <p className="t-caption">{viewer === 'ADMIN' ? 'Read-only view for coordinators.' : ''}</p>
      ) : !open ? (
        <p className="rounded-[12px] bg-canvas px-4 py-3 t-body-sm text-muted">Chat closed</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {allowShareLocation && (
              <button type="button" className="chip" onClick={shareLocation} disabled={sending}>
                <IconPin size={16} /> Share my location
              </button>
            )}
            {quickReplies.map((q) => (
              <button key={q} type="button" className="chip" disabled={sending} onClick={() => send({ text: q })}>{q}</button>
            ))}
          </div>
          {voice ? (
            <div className="flex items-center gap-2">
              <div className="flex-1"><VoiceRecorder compact value={voice} onChange={setVoice} /></div>
              <button type="button" className="btn btn-primary" disabled={sending} onClick={() => send({ audioBase64: voice.base64, audioMime: voice.mime })}>
                {sending ? <Spinner size={16} /> : <IconSend size={16} />} Send
              </button>
            </div>
          ) : (
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send({ text }); }}>
              <VoiceRecorder compact value={null} onChange={setVoice} disabled={sending} />
              <label className="sr-only" htmlFor="chat-input">Message</label>
              <input id="chat-input" className="input flex-1 !rounded-full" placeholder="Type a message" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
              <button type="submit" aria-label="Send message" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-ink text-white disabled:opacity-40" disabled={sending || !text.trim()}>
                {sending ? <Spinner size={16} /> : <IconSend size={18} />}
              </button>
            </form>
          )}
          {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}
