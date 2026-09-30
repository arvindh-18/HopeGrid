// S03 Report sent — code + PIN, sync status, "Send by SMS" while unsent (F27) and the offline keyword preview
// (features.md F02, F05).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keywordExtractor } from '../../shared/keywordExtractor';
import { encodeSmsReport } from '../../shared/sms';
import { IconCheck, IconCopy, IconMic, IconRefresh, IconSend, IconWifiOff } from '../components/Icons';
import { Layout } from '../components/Layout';
import { Button, EmptyState, LoadingBlock, Notice, Spinner, useToast } from '../components/ui';
import { useI18n } from '../i18n';
import { SMS_NUMBER, smsHref } from '../lib/sms';
import * as outbox from '../offline/outbox';
import { useOnline } from '../offline/useOnline';

export default function ReportSent() {
  const { id } = useParams();
  const items = useOutbox();
  const online = useOnline();
  const toast = useToast();
  const { t, server, type, need } = useI18n();
  const [retrying, setRetrying] = useState(false);
  const item = items?.find((i) => i.id === id);

  const preview = useMemo(() => (item?.submission.text ? keywordExtractor(item.submission.text) : null), [item?.submission.text]);

  if (items === null) return <Layout emergency><LoadingBlock /></Layout>;
  if (!item) {
    return (
      <Layout emergency>
        <div className="mx-auto max-w-xl">
          <EmptyState
            title={t('sent.notHereTitle')}
            body={t('sent.notHereBody')}
            action={<Link to="/track" className="btn btn-primary">{t('sent.trackWith')}</Link>}
          />
        </div>
      </Layout>
    );
  }

  const s = item.submission;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t('sent.clip', { code: s.code, pin: s.pin }));
      toast(t('sent.copied'));
    } catch {
      toast(t('sent.copyFailed'), 'info');
    }
  };
  const retry = async () => {
    setRetrying(true);
    await outbox.retryAll();
    setRetrying(false);
    if (!online) toast(t('sent.stillOffline'), 'info');
  };

  const summaryBits = preview
    ? [
        type(preview.type),
        (s.people ?? preview.people) !== null ? t((s.people ?? preview.people) === 1 ? 'sent.person' : 'sent.people', { n: (s.people ?? preview.people)! }) : null,
        preview.vulnerable || preview.mobilityIssue ? t('sent.vulnerable') : null,
        preview.trapped ? t('sent.trapped') : null,
        preview.medical ? t('sent.medical') : null,
        ...[...new Set([...preview.needs, ...s.needs])].map(need),
      ].filter(Boolean)
    : s.needs.map(need);

  return (
    <Layout emergency>
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <header>
          <h1 className="t-title-lg">{item.status === 'SENT' ? t('sent.titleSent') : t('sent.titleSaved')}</h1>
          <p className="mt-2 text-muted">{t('sent.keep')}</p>
        </header>

        <section className="card overflow-hidden" aria-label={t('sent.codeAndPin')}>
          <div className="grid grid-cols-[1.6fr_1fr] divide-x divide-strong">
            <div className="p-6">
              <p className="t-caption">{t('sent.code')}</p>
              <p className="mt-1 font-display text-[40px] leading-none tracking-[0.08em] text-ink tabular-nums">{s.code}</p>
            </div>
            <div className="p-6">
              <p className="t-caption">{t('sent.pin')}</p>
              <p className="mt-1 font-display text-[40px] leading-none tracking-[0.12em] text-ink tabular-nums">{s.pin}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-strong px-6 py-3">
            <SyncBadge status={item.status} />
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-[14px] text-ink"><IconCopy size={16} /> {t('sent.copy')}</button>
          </div>
        </section>

        {item.status === 'FAILED' && (
          <Notice tone="danger" action={<button type="button" className="btn btn-outline btn-sm" onClick={() => outbox.remove(item.id)}>{t('sent.delete')}</button>}>
            {t('sent.couldNotSend', { error: server(item.error ?? '') })}
          </Notice>
        )}
        {item.status !== 'SENT' && item.status !== 'FAILED' && (
          <Notice tone="warning" action={<Button variant="outline" size="sm" busy={retrying} onClick={retry}><IconRefresh size={16} /> {t('sent.retry')}</Button>}>
            {online
              ? t('sent.sending')
              : t('sent.savedOffline')}
          </Notice>
        )}

        {item.status !== 'SENT' && SMS_NUMBER && (
          <section className="card card-pad flex flex-col gap-3" aria-labelledby="by-sms">
            <h2 id="by-sms" className="t-title-sm">{t('sms.title')}</h2>
            <p className="t-body-sm text-muted">{t('sms.body')}</p>
            {(s.photoBase64 || s.audioBase64) && <p className="t-body-sm text-muted">{t('sms.mediaLater')}</p>}
            <a
              href={smsHref(SMS_NUMBER, encodeSmsReport(s))}
              onClick={() => void outbox.markSms(item.id)}
              className={`btn ${item.status === 'SENDING' ? 'btn-outline' : 'btn-danger'} btn-lg btn-block`}
            >
              <IconSend size={18} /> {item.smsAt ? t('sms.again') : t('sms.button')}
            </a>
            {item.smsAt && <p className="t-body-sm" role="status">{t('sms.opened')}</p>}
            <p className="t-caption">{t('sms.to', { n: SMS_NUMBER })}</p>
          </section>
        )}

        <section className="card card-pad" aria-labelledby="understood">
          <div className="flex items-center justify-between gap-2">
            <h2 id="understood" className="t-title-sm">{t('sent.understood')}</h2>
            <span className="tag tone-neutral">{t('sent.preliminary')}</span>
          </div>
          {summaryBits.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {summaryBits.map((b) => <li key={b} className="rounded-full bg-canvas px-3 py-1.5 text-[14px]">{b}</li>)}
            </ul>
          ) : (
            <p className="mt-3 t-body-sm text-muted">{t('sent.understandLater')}</p>
          )}
          {s.audioBase64 && (
            <p className="mt-4 flex items-center gap-2 t-body-sm text-muted"><IconMic size={16} /> {t('sent.voiceLater')}</p>
          )}
          {s.text && <p className="mt-4 border-l-2 border-hairline pl-3 t-body-sm text-muted">"{s.text}"</p>}
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link to={`/track?r=${item.id}`} className="btn btn-primary btn-lg flex-1">{t('sent.track')}</Link>
          <Link to="/" className="btn btn-outline btn-lg flex-1">{t('sent.home')}</Link>
        </div>
      </div>
    </Layout>
  );
}

const useOutbox = outbox.useOutbox;

function SyncBadge({ status }: { status: outbox.OutboxStatus }) {
  const { t } = useI18n();
  if (status === 'SENT') return <span className="tag tone-ok"><IconCheck size={14} /> {t('sync.sent')}</span>;
  if (status === 'SENDING') return <span className="tag tone-info"><Spinner size={12} /> {t('sync.sending')}</span>;
  if (status === 'FAILED') return <span className="tag tone-critical">{t('sync.notSent')}</span>;
  return <span className="tag tone-medium"><IconWifiOff size={14} /> {t('sync.savedAuto')}</span>;
}
