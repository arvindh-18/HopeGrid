// S10 Assignment — status steps, directions, and private chat with reporters (features.md F16, F17).
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { POLL_CHAT_MS, POLL_VOLUNTEER_MS } from '../../../shared/constants';
import { ApiError, CHAT_OPEN_ASSIGNMENT, type AssignmentStatus, type VolunteerAssignment } from '../../../shared/types';
import { AssignmentBadge, PriorityBadge, Tag } from '../../components/Badges';
import { ChatBox } from '../../components/ChatBox';
import { IconArrowLeft, IconCheck, IconExternal, IconPin } from '../../components/Icons';
import { Layout } from '../../components/Layout';
import { Modal } from '../../components/Modal';
import { Button, EmptyState, ErrorState, FreshnessLine, LoadingBlock, Notice, useToast } from '../../components/ui';
import { api } from '../../data';
import { usePoll } from '../../hooks/usePoll';
import { mapsLink } from '../../lib/geo';
import { NEED_LABEL, TYPE_ICON, TYPE_LABEL, VOLUNTEER_QUICK_REPLIES } from '../../lib/labels';
import { ReasonPicker } from './VolunteerHome';

const STEPS: { status: AssignmentStatus; label: string }[] = [
  { status: 'ACCEPTED', label: 'Accepted' },
  { status: 'EN_ROUTE', label: 'On the way' },
  { status: 'ON_SITE', label: 'Arrived' },
  { status: 'ASSISTING', label: 'Helping' },
  { status: 'DONE', label: 'Done' },
];

/** Next actions per status (rules.md BR-101). */
const NEXT: Partial<Record<AssignmentStatus, { to: AssignmentStatus; label: string; primary?: boolean }[]>> = {
  ACCEPTED: [{ to: 'EN_ROUTE', label: "I'm on my way", primary: true }, { to: 'ON_SITE', label: "I've arrived" }],
  EN_ROUTE: [{ to: 'ON_SITE', label: "I've arrived", primary: true }],
  ON_SITE: [{ to: 'ASSISTING', label: "I'm helping now", primary: true }, { to: 'DONE', label: 'Help completed' }],
  ASSISTING: [{ to: 'DONE', label: 'Help completed', primary: true }],
};

export default function AssignmentPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const list = usePoll(() => api.listMyAssignments(), POLL_VOLUNTEER_MS, [id], true, (onChange, onLive) => api.watchVolunteer(onChange, onLive));
  const a = list.data?.find((x) => x.id === id) ?? null;
  const chatOpen = !!a && CHAT_OPEN_ASSIGNMENT.includes(a.status);
  const chat = usePoll(() => api.getAssignmentChat(id), chatOpen ? POLL_CHAT_MS : POLL_VOLUNTEER_MS, [id], !!a && a.status !== 'ASSIGNED',
    (onChange, onLive) => api.watchVolunteer(onChange, onLive));
  const [busy, setBusy] = useState(false);
  const [unable, setUnable] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);

  async function move(to: AssignmentStatus, reason?: string) {
    if (!a) return;
    setBusy(true);
    try {
      const updated = await api.updateAssignmentStatus(a.id, to, reason);
      list.setData((list.data ?? []).map((x) => (x.id === a.id ? updated : x)));
      void chat.refresh();
      toast(to === 'UNABLE' ? 'The coordinator has been told' : to === 'DONE' ? 'Marked as done. Thank you.' : 'Status updated');
      setUnable(false);
      setConfirmDone(false);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not update. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const back = <Link to="/volunteer" className="inline-flex items-center gap-1.5 text-[14px] text-muted no-underline hover:text-ink"><IconArrowLeft size={16} /> My assignments</Link>;

  return (
    <Layout variant="volunteer">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        {back}
        {list.loading ? (
          <LoadingBlock rows={4} />
        ) : !list.data ? (
          <ErrorState message={list.error?.message ?? 'Could not load this assignment.'} onRetry={list.refresh} />
        ) : !a ? (
          <EmptyState title="Assignment not found" body="It may have been cancelled or is older than your recent history." action={<Link to="/volunteer" className="btn btn-primary">Back to my assignments</Link>} />
        ) : (
          <AssignmentBody a={a} busy={busy} onMove={(to) => (to === 'DONE' ? setConfirmDone(true) : move(to))} onUnable={() => setUnable(true)}
            lastUpdated={list.lastUpdated} stale={list.stale} onRefresh={list.refresh}
            chat={
              a.status === 'ASSIGNED' ? null : (
                <section className="card card-pad flex flex-col gap-3" aria-labelledby="chat-h">
                  <div>
                    <h2 id="chat-h" className="t-title-sm">Chat with the reporter{a.reporters.length > 1 ? 's' : ''}</h2>
                    <p className="t-caption mt-1">Phone numbers stay hidden on both sides.</p>
                  </div>
                  {chat.loading ? <LoadingBlock rows={1} /> : chat.data ? (
                    <ChatBox
                      threads={chat.data.threads}
                      open={chat.data.open}
                      viewer="VOLUNTEER"
                      quickReplies={VOLUNTEER_QUICK_REPLIES}
                      onSend={async (reportId, msg) => { await api.sendVolunteerMessage(a.id, reportId, msg); await chat.refresh(); }}
                    />
                  ) : <ErrorState message={chat.error?.message ?? 'Could not load chat.'} onRetry={chat.refresh} />}
                </section>
              )
            }
          />
        )}
      </div>
      {unable && <ReasonPicker title="Can't continue?" confirm="Tell the coordinator" busy={busy} onClose={() => setUnable(false)} onConfirm={(r) => move('UNABLE', r)} />}
      {confirmDone && (
        <Modal open title="Mark help as completed?" onClose={() => setConfirmDone(false)} size="sm" footer={<>
          <Button variant="ghost" onClick={() => setConfirmDone(false)}>Not yet</Button>
          <Button variant="lime" busy={busy} onClick={() => move('DONE')}>Help completed</Button>
        </>}>
          <p className="t-body-sm">The chat closes and the coordinator is asked to resolve the incident. You become available for new requests.</p>
        </Modal>
      )}
    </Layout>
  );
}

function AssignmentBody({ a, busy, onMove, onUnable, chat, lastUpdated, stale, onRefresh }: {
  a: VolunteerAssignment; busy: boolean; onMove: (to: AssignmentStatus) => void; onUnable: () => void; chat: ReactNode;
  lastUpdated: Date | null; stale: boolean; onRefresh: () => void;
}) {
  const i = a.incident;
  const idx = STEPS.findIndex((s) => s.status === a.status);
  const ended = ['DONE', 'DECLINED', 'UNABLE', 'CANCELLED'].includes(a.status);
  const next = NEXT[a.status] ?? [];

  return (
    <>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="t-title-lg">{TYPE_ICON[i.type]} {TYPE_LABEL[i.type]}</h1>
          <PriorityBadge level={i.priority} />
          <AssignmentBadge status={a.status} />
        </div>
        <div className="mt-2"><FreshnessLine lastUpdated={lastUpdated} stale={stale} onRefresh={onRefresh} /></div>
      </header>

      {a.status === 'ASSIGNED' && <Notice tone="info" action={<Link to="/volunteer" className="btn btn-outline btn-sm">Respond</Link>}>Accept or decline this request on your home screen first.</Notice>}
      {a.status === 'CANCELLED' && <Notice tone="warning">The coordinator cancelled this assignment. You're available for new requests.</Notice>}
      {(a.status === 'UNABLE' || a.status === 'DECLINED') && <Notice tone="info">You told the coordinator you can't help with this one.</Notice>}

      <section className="card card-pad" aria-label="Incident">
        {i.summary && <p className="text-[17px] leading-relaxed text-ink">{i.summary}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {i.people !== null && <Tag>{i.people} people</Tag>}
          {i.trapped && <Tag tone="critical">Trapped</Tag>}
          {i.vulnerable && <Tag tone="high">Vulnerable person</Tag>}
          {i.medical && <Tag tone="high">Medical need</Tag>}
          {i.danger && <Tag tone="medium">Immediate danger</Tag>}
          {i.needs.map((n) => <Tag key={n} tone="info">{NEED_LABEL[n]}</Tag>)}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[12px] bg-canvas px-4 py-3">
          <IconPin size={18} />
          <span className="flex-1 t-body-sm">{i.locationText ?? 'See map for the exact spot'}</span>
          {i.lat !== null && i.lng !== null && (
            <a href={mapsLink(i.lat, i.lng)} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Open in Maps <IconExternal size={14} /></a>
          )}
        </div>
      </section>

      {a.status !== 'ASSIGNED' && !['DECLINED', 'CANCELLED'].includes(a.status) && (
        <section className="card card-pad" aria-labelledby="steps-h">
          <h2 id="steps-h" className="sr-only">Progress</h2>
          <ol className="grid grid-cols-5 gap-1">
            {STEPS.map((s, n) => {
              const done = idx >= 0 && n < idx;
              const current = n === idx;
              return (
                <li key={s.status} className="flex flex-col items-center gap-2 text-center" aria-current={current ? 'step' : undefined}>
                  <span className={`h-1.5 w-full rounded-full ${done || current ? 'bg-ink' : 'bg-strong'}`} />
                  <span className={`flex items-center gap-1 text-[12.5px] sm:text-[13px] ${current ? 'font-medium text-ink' : done ? 'text-body' : 'text-muted'}`}>
                    {done && <IconCheck size={13} />}{s.label}
                  </span>
                </li>
              );
            })}
          </ol>
          {!ended && (
            <div className="mt-5 flex flex-col gap-2">
              {next.map((n) => (
                <Button key={n.to} variant={n.primary ? (n.to === 'DONE' ? 'lime' : 'primary') : 'outline'} size="lg" block busy={busy && n.primary} disabled={busy} onClick={() => onMove(n.to)}>
                  {n.label}
                </Button>
              ))}
              <Button variant="ghost" className="self-center text-danger" disabled={busy} onClick={onUnable}>I can't continue</Button>
            </div>
          )}
          {a.status === 'DONE' && <p className="mt-4 t-body-sm text-success">You completed this assignment. Thank you.</p>}
          {a.status === 'UNABLE' && <p className="mt-4 t-body-sm text-muted">Stopped: the coordinator will reassign.</p>}
        </section>
      )}

      {chat}
    </>
  );
}
