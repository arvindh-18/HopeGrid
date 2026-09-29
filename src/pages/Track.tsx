// S04 Track — victim status, public updates, optional phone verification and private chat (F06, F07, F17).
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { POLL_CHAT_MS, POLL_TRACK_MS } from '../../shared/constants';
import { ApiError, VICTIM_STEPS, type ChatThread, type TrackView } from '../../shared/types';
import { ChatBox } from '../components/ChatBox';
import { IconCheck } from '../components/Icons';
import { Layout } from '../components/Layout';
import { Button, ErrorState, Field, FreshnessLine, LoadingBlock, Notice, clockTime, useToast } from '../components/ui';
import { EMERGENCY_NUMBER, api } from '../data';
import { usePoll } from '../hooks/usePoll';
import { useI18n } from '../i18n';
import { useOutbox } from '../offline/outbox';

const SESSION_KEY = 'trackCreds';
type Creds = { code: string; pin: string };

function readCreds(): Creds | null {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
}

export default function Track() {
  const [params] = useSearchParams();
  const outboxItems = useOutbox();
  const { t } = useI18n();
  const [creds, setCreds] = useState<Creds | null>(readCreds);
  const fromOutbox = params.get('r') ? outboxItems?.find((i) => i.id === params.get('r')) : undefined;

  // ?r=<id> — fill in code/PIN from this phone's outbox.
  useEffect(() => {
    if (fromOutbox) {
      const c = { code: fromOutbox.submission.code, pin: fromOutbox.submission.pin };
      setCreds(c);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(c));
    }
  }, [fromOutbox?.id, fromOutbox?.submission.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const unsent = outboxItems?.find((i) => creds && i.submission.code === creds.code && i.status !== 'SENT');

  const signOut = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setCreds(null);
  };

  return (
    <Layout emergency>
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        {!creds ? (
          <TrackForm onSubmit={(c) => { sessionStorage.setItem(SESSION_KEY, JSON.stringify(c)); setCreds(c); }} />
        ) : unsent ? (
          <>
            <h1 className="t-title-lg">{t('track.reportN', { code: creds.code })}</h1>
            <Notice tone="warning" action={<Link to={`/report/sent/${unsent.id}`} className="btn btn-outline btn-sm">{t('track.viewReport')}</Link>}>
              {t('track.notSentYet')}
            </Notice>
          </>
        ) : (
          <TrackStatus creds={creds} onSignOut={signOut} />
        )}
      </div>
    </Layout>
  );
}

function TrackForm({ onSubmit }: { onSubmit: (c: Creds) => void }) {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t, server } = useI18n();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const c = { code: code.trim().toUpperCase(), pin: pin.trim() };
    if (c.code.length < 5 || !/^\d{4}$/.test(c.pin)) {
      setError(t('track.enterBoth'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.track(c.code, c.pin);
      onSubmit(c);
    } catch (err) {
      setError(err instanceof ApiError ? server(err.message) : t('track.couldNotCheck'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header>
        <h1 className="t-title-lg">{t('track.title')}</h1>
        <p className="mt-2 text-muted">{t('track.lede')}</p>
      </header>
      <form onSubmit={submit} className="card card-pad flex flex-col gap-4" noValidate>
        <Field label={t('track.code')} htmlFor="code">
          <input id="code" className="input uppercase tracking-[0.1em]" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('track.codePh')} autoComplete="off" maxLength={8} aria-invalid={!!error} />
        </Field>
        <Field label={t('track.pin')} htmlFor="pin">
          <input id="pin" className="input tracking-[0.2em]" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder={t('track.pinPh')} aria-invalid={!!error} />
        </Field>
        {error && <p className="text-[14px] text-danger" role="alert">{error}</p>}
        <Button type="submit" size="lg" busy={busy}>{t('track.check')}</Button>
      </form>
    </>
  );
}

function TrackStatus({ creds, onSignOut }: { creds: Creds; onSignOut: () => void }) {
  const track = usePoll<TrackView>(() => api.track(creds.code, creds.pin), POLL_TRACK_MS, [creds.code, creds.pin]);
  const t = track.data;
  const { t: tr, server, step } = useI18n();

  if (track.loading) return <LoadingBlock rows={4} />;
  if (!t) {
    return (
      <>
        <ErrorState message={track.error?.message ?? tr('track.couldNotLoad')} onRetry={track.refresh} />
        <button type="button" className="btn btn-ghost self-start" onClick={onSignOut}>{tr('track.different')}</button>
      </>
    );
  }

  const currentIdx = t.step === 'CLOSED' ? -1 : VICTIM_STEPS.indexOf(t.step);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="t-caption">{tr('track.report')}</p>
          <h1 className="t-title-lg tracking-[0.06em]">{t.code}</h1>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>{tr('track.different')}</button>
      </header>

      {t.step === 'CLOSED' ? (
        <Notice tone="danger">{tr('track.closed', { n: EMERGENCY_NUMBER })}</Notice>
      ) : (
        <section className="card card-pad" aria-labelledby="progress">
          <h2 id="progress" className="t-title-md">{step(t.step)}</h2>
          <ol className="mt-5 flex flex-col">
            {VICTIM_STEPS.map((s, i) => {
              const done = i < currentIdx;
              const current = i === currentIdx;
              return (
                <li key={s} className="relative flex gap-3 pb-4 last:pb-0" aria-current={current ? 'step' : undefined}>
                  {i < VICTIM_STEPS.length - 1 && <span className={`absolute left-[11px] top-6 h-[calc(100%-16px)] w-0.5 ${done ? 'bg-ink' : 'bg-strong'}`} aria-hidden />}
                  <span className={`relative z-[1] grid h-6 w-6 flex-none place-items-center rounded-full text-[12px] ${done ? 'bg-ink text-white' : current ? 'bg-lime text-ink ring-2 ring-ink' : 'bg-strong text-muted'}`}>
                    {done ? <IconCheck size={14} /> : i + 1}
                  </span>
                  <span className={`pt-0.5 text-[15px] ${current ? 'font-medium text-ink' : done ? 'text-body' : 'text-muted'}`}>{step(s)}</span>
                </li>
              );
            })}
          </ol>
          <div className="mt-4"><FreshnessLine lastUpdated={track.lastUpdated} stale={track.stale} onRefresh={track.refresh} /></div>
        </section>
      )}

      <VictimChat creds={creds} open={t.chatOpen} step={t.step} />

      {!t.phoneVerified && t.step !== 'CLOSED' && t.step !== 'RESOLVED' && (
        <PhoneVerify creds={creds} onDone={track.refresh} />
      )}

      <section className="card card-pad" aria-labelledby="updates">
        <h2 id="updates" className="t-title-sm">{tr('track.updates')}</h2>
        {t.messages.length === 0 ? (
          <p className="mt-3 t-body-sm text-muted">{tr('track.noUpdates')}</p>
        ) : (
          <ol className="mt-3 flex flex-col">
            {t.messages.map((m, i) => (
              <li key={i} className="grid grid-cols-[64px_1fr] gap-3 border-b border-strong py-2.5 last:border-0">
                <span className="t-caption tabular-nums">{clockTime(m.at)}</span>
                <span className="t-body-sm">{server(m.text)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function VictimChat({ creds, open, step }: { creds: Creds; open: boolean; step: TrackView['step'] }) {
  const chat = usePoll(() => api.getVictimChat(creds.code, creds.pin), open ? POLL_CHAT_MS : POLL_TRACK_MS, [creds.code, creds.pin, open]);
  const hasMessages = (chat.data?.messages.length ?? 0) > 0;
  const { t } = useI18n();
  if (!open && !hasMessages) {
    if (step === 'RESOLVED' || step === 'CLOSED') return null;
    return (
      <section className="card card-pad">
        <h2 className="t-title-sm">{t('chat.title')}</h2>
        <p className="mt-2 t-body-sm text-muted">{t('chat.opensLater')}</p>
      </section>
    );
  }
  const threads: ChatThread[] = [{ reportId: 'me', label: t('chat.you'), messages: chat.data?.messages ?? [] }];
  return (
    <section className="card card-pad flex flex-col gap-3" aria-labelledby="chat-h">
      <div>
        <h2 id="chat-h" className="t-title-sm">{t('chat.title')}</h2>
        <p className="t-caption mt-1">{t('chat.private')}</p>
      </div>
      <ChatBox
        threads={threads}
        open={chat.data?.open ?? open}
        viewer="VICTIM"
        quickReplies={[t('quick.1'), t('quick.2'), t('quick.3'), t('quick.4')]}
        allowShareLocation
        onSend={async (_rid, msg) => {
          await api.sendVictimMessage(creds.code, creds.pin, msg);
          await chat.refresh();
        }}
      />
    </section>
  );
}

function PhoneVerify({ creds, onDone }: { creds: Creds; onDone: () => void }) {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, server } = useI18n();

  function sendCode(e: FormEvent) {
    e.preventDefault();
    if (!/^\+?[\d ]{7,17}$/.test(phone.trim())) {
      setError(t('verify.badPhone'));
      return;
    }
    setError(null);
    setSent(true); // Simulated OTP — no SMS is sent (architecture D9).
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.verifyPhone(creds.code, creds.pin, phone, otp);
      toast(t('verify.done'));
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? server(err.message) : t('verify.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-pad" aria-labelledby="verify-h">
      <h2 id="verify-h" className="t-title-sm">{t('verify.title')}</h2>
      <p className="mt-1 t-body-sm text-muted">{t('verify.lede')}</p>
      {!sent ? (
        <form onSubmit={sendCode} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label={t('verify.phone')} htmlFor="vphone" error={error}>
              <input id="vphone" className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98400 00000" />
            </Field>
          </div>
          <Button type="submit" variant="outline">{t('verify.send')}</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label={t('verify.code')} htmlFor="otp" error={error} hint={import.meta.env.DEV ? t('verify.demo') : undefined}>
              <input id="otp" className="input tracking-[0.2em]" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('verify.codePh')} />
            </Field>
          </div>
          <Button type="submit" busy={busy}>{t('verify.verify')}</Button>
        </form>
      )}
    </section>
  );
}
