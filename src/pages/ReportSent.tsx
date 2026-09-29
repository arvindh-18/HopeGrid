// S03 Report sent — code + PIN, sync status and the offline keyword preview (features.md F02, F05).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keywordExtractor } from '../../shared/keywordExtractor';
import { IconCheck, IconCopy, IconMic, IconRefresh, IconWifiOff } from '../components/Icons';
import { Layout } from '../components/Layout';
import { Button, EmptyState, LoadingBlock, Notice, Spinner, useToast } from '../components/ui';
import { NEED_LABEL, TYPE_LABEL } from '../lib/labels';
import * as outbox from '../offline/outbox';
import { useOnline } from '../offline/useOnline';

export default function ReportSent() {
  const { id } = useParams();
  const items = useOutbox();
  const online = useOnline();
  const toast = useToast();
  const [retrying, setRetrying] = useState(false);
  const item = items?.find((i) => i.id === id);

  const preview = useMemo(() => (item?.submission.text ? keywordExtractor(item.submission.text) : null), [item?.submission.text]);

  if (items === null) return <Layout emergency><LoadingBlock /></Layout>;
  if (!item) {
    return (
      <Layout emergency>
        <div className="mx-auto max-w-xl">
          <EmptyState
            title="This report isn't on this phone"
            body="Reports are saved on the phone that sent them. If you have a code and PIN, you can still track it."
            action={<Link to="/track" className="btn btn-primary">Track with code and PIN</Link>}
          />
        </div>
      </Layout>
    );
  }

  const s = item.submission;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Report code: ${s.code}  PIN: ${s.pin}`);
      toast('Code and PIN copied');
    } catch {
      toast('Copy is not available. Write the code down.', 'info');
    }
  };
  const retry = async () => {
    setRetrying(true);
    await outbox.retryAll();
    setRetrying(false);
    if (!online) toast("You're still offline. It will send when you're back online.", 'info');
  };

  const summaryBits = preview
    ? [
        TYPE_LABEL[preview.type],
        (s.people ?? preview.people) !== null ? `${s.people ?? preview.people} ${(s.people ?? preview.people) === 1 ? 'person' : 'people'}` : null,
        preview.vulnerable || preview.mobilityIssue ? 'vulnerable person' : null,
        preview.trapped ? 'trapped' : null,
        preview.medical ? 'medical need' : null,
        ...[...new Set([...preview.needs, ...s.needs])].map((n) => NEED_LABEL[n]),
      ].filter(Boolean)
    : s.needs.map((n) => NEED_LABEL[n]);

  return (
    <Layout emergency>
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <header>
          <h1 className="t-title-lg">{item.status === 'SENT' ? 'Your report was sent' : 'Your report is saved'}</h1>
          <p className="mt-2 text-muted">Keep this code and PIN. You need both to check on your report.</p>
        </header>

        <section className="card overflow-hidden" aria-label="Report code and PIN">
          <div className="grid grid-cols-[1.6fr_1fr] divide-x divide-strong">
            <div className="p-6">
              <p className="t-caption">Report code</p>
              <p className="mt-1 font-display text-[40px] leading-none tracking-[0.08em] text-ink tabular-nums">{s.code}</p>
            </div>
            <div className="p-6">
              <p className="t-caption">PIN</p>
              <p className="mt-1 font-display text-[40px] leading-none tracking-[0.12em] text-ink tabular-nums">{s.pin}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-strong px-6 py-3">
            <SyncBadge status={item.status} />
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-[14px] text-ink"><IconCopy size={16} /> Copy</button>
          </div>
        </section>

        {item.status === 'FAILED' && (
          <Notice tone="danger" action={<button type="button" className="btn btn-outline btn-sm" onClick={() => outbox.remove(item.id)}>Delete</button>}>
            Could not send: {item.error}
          </Notice>
        )}
        {item.status !== 'SENT' && item.status !== 'FAILED' && (
          <Notice tone="warning" action={<Button variant="outline" size="sm" busy={retrying} onClick={retry}><IconRefresh size={16} /> Retry now</Button>}>
            {online
              ? 'Sending your report…'
              : 'Saved on this phone. It will send automatically when you have a connection — keep this app open, or open it again later.'}
          </Notice>
        )}

        <section className="card card-pad" aria-labelledby="understood">
          <div className="flex items-center justify-between gap-2">
            <h2 id="understood" className="t-title-sm">Here's what we understood</h2>
            <span className="tag tone-neutral">Preliminary</span>
          </div>
          {summaryBits.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {summaryBits.map((b) => <li key={b} className="rounded-full bg-canvas px-3 py-1.5 text-[14px]">{b}</li>)}
            </ul>
          ) : (
            <p className="mt-3 t-body-sm text-muted">We'll understand more once your report reaches the team.</p>
          )}
          {s.audioBase64 && (
            <p className="mt-4 flex items-center gap-2 t-body-sm text-muted"><IconMic size={16} /> Your voice note will be turned into text when it is sent.</p>
          )}
          {s.text && <p className="mt-4 border-l-2 border-hairline pl-3 t-body-sm text-muted">"{s.text}"</p>}
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link to={`/track?r=${item.id}`} className="btn btn-primary btn-lg flex-1">Track this report</Link>
          <Link to="/" className="btn btn-outline btn-lg flex-1">Back to home</Link>
        </div>
      </div>
    </Layout>
  );
}

const useOutbox = outbox.useOutbox;

function SyncBadge({ status }: { status: outbox.OutboxStatus }) {
  if (status === 'SENT') return <span className="tag tone-ok"><IconCheck size={14} /> Sent</span>;
  if (status === 'SENDING') return <span className="tag tone-info"><Spinner size={12} /> Sending…</span>;
  if (status === 'FAILED') return <span className="tag tone-critical">Not sent</span>;
  return <span className="tag tone-medium"><IconWifiOff size={14} /> Saved on this phone — will send automatically</span>;
}
