// S12 Volunteers (features.md F26): review volunteer applications (details, skills, equipment, ID proof) and approve
// or reject them; list the approved volunteers.
import { useState } from 'react';
import { POLL_ADMIN_MS, POLL_RESOURCES_MS } from '../../../shared/constants';
import { ApiError, type ApplicationStatus, type VolunteerApplication } from '../../../shared/types';
import { Tag } from '../../components/Badges';
import { IconExternal, IconPhone } from '../../components/Icons';
import { Layout } from '../../components/Layout';
import { Modal } from '../../components/Modal';
import { Button, EmptyState, ErrorState, Field, LoadingBlock, PageHeader, timeAgo, useToast } from '../../components/ui';
import { api } from '../../data';
import { usePoll } from '../../hooks/usePoll';
import { AVAILABILITY_LABEL, EQUIPMENT_LABEL, SKILL_LABEL, VEHICLE_LABEL } from '../../lib/labels';
import { whatsappLink } from '../../lib/whatsapp';

type Tab = ApplicationStatus | 'VOLUNTEERS';
const TABS: { id: Tab; label: string }[] = [
  { id: 'PENDING', label: 'Waiting for review' },
  { id: 'VOLUNTEERS', label: 'Volunteers' },
  { id: 'REJECTED', label: 'Rejected' },
];

export default function Volunteers() {
  const [tab, setTab] = useState<Tab>('PENDING');
  const pending = usePoll(() => api.listApplications('PENDING'), POLL_ADMIN_MS);
  const count = pending.data?.length ?? 0;
  return (
    <Layout variant="admin" width="wide">
      <PageHeader title="Volunteers" subtitle="Check new volunteer applications and see who can be assigned." />
      <div role="tablist" className="mb-5 flex w-fit flex-wrap gap-1 rounded-full bg-white p-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-[14px] ${tab === t.id ? 'bg-ink text-white' : 'text-body hover:bg-canvas'}`}>
            {t.label}{t.id === 'PENDING' && count > 0 ? ` (${count})` : ''}
          </button>
        ))}
      </div>
      {tab === 'PENDING' && <Applications poll={pending} reviewable />}
      {tab === 'REJECTED' && <RejectedList />}
      {tab === 'VOLUNTEERS' && <VolunteerList />}
    </Layout>
  );
}

function RejectedList() {
  const q = usePoll(() => api.listApplications('REJECTED'), POLL_RESOURCES_MS);
  return <Applications poll={q} reviewable={false} />;
}

function Applications({ poll: q, reviewable }: { poll: ReturnType<typeof usePoll<VolunteerApplication[]>>; reviewable: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<VolunteerApplication | null>(null);
  const [reason, setReason] = useState('');

  async function approve(a: VolunteerApplication) {
    setBusy(a.id);
    try {
      await api.approveApplication(a.id);
      toast(`${a.name} is now a volunteer`);
      await q.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not approve.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!rejecting || !reason.trim()) return;
    setBusy(rejecting.id);
    try {
      await api.rejectApplication(rejecting.id, reason.trim());
      toast('Application rejected');
      setRejecting(null);
      setReason('');
      await q.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not reject.', 'error');
    } finally {
      setBusy(null);
    }
  }

  if (q.loading) return <LoadingBlock rows={3} />;
  if (!q.data) return <ErrorState message={q.error?.message ?? 'Could not load applications.'} onRetry={q.refresh} />;
  if (q.data.length === 0) {
    return <EmptyState title={reviewable ? 'No applications waiting' : 'No rejected applications'} body={reviewable ? 'New volunteer applications from /volunteer/register appear here.' : undefined} />;
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {q.data.map((a) => (
          <article key={a.id} className="card card-pad flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="t-title-sm">{a.name}</h2>
                <p className="t-caption">{a.email} · {a.phone} · applied {timeAgo(a.createdAt)}</p>
                {(a.locationText || a.hasLocation) && <p className="t-caption">{a.locationText ?? 'Location shared'}{a.locationText && a.hasLocation ? ' (location shared)' : ''}</p>}
              </div>
              {!reviewable && <Tag tone="neutral">Rejected</Tag>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {a.skills.map((s) => <Tag key={s}>{SKILL_LABEL[s]}</Tag>)}
              {a.equipment.map((e) => <Tag key={e} tone="info">{EQUIPMENT_LABEL[e]}</Tag>)}
              <Tag tone="neutral">{VEHICLE_LABEL[a.vehicle]}</Tag>
            </div>
            {a.proofUrl ? (
              <a href={a.proofUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[12px] bg-canvas" title="Open the ID proof">
                <img src={a.proofUrl} alt={`ID proof of ${a.name}`} className="max-h-56 w-full object-contain" />
              </a>
            ) : (
              <p className="t-caption">ID proof deleted{a.rejectReason ? ` · reason: ${a.rejectReason}` : ''}</p>
            )}
            {reviewable && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" busy={busy === a.id} onClick={() => approve(a)}>Approve</Button>
                <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => { setRejecting(a); setReason(''); }}>Reject</Button>
                {a.proofUrl && <a href={a.proofUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm"><IconExternal size={14} /> Open proof</a>}
              </div>
            )}
          </article>
        ))}
      </div>

      <Modal
        open={!!rejecting}
        title={`Reject ${rejecting?.name ?? ''}'s application?`}
        onClose={() => setRejecting(null)}
        footer={<>
          <Button variant="outline" onClick={() => setRejecting(null)}>Keep it</Button>
          <Button variant="danger" busy={!!rejecting && busy === rejecting.id} disabled={!reason.trim()} onClick={reject}>Reject</Button>
        </>}
      >
        <p className="t-body-sm">Their login is removed and the ID proof is deleted. They can apply again later.</p>
        <div className="mt-3">
          <Field label="Reason" htmlFor="reject-reason">
            <input id="reject-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ID photo is unreadable" />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function VolunteerList() {
  const q = usePoll(() => api.listVolunteers(), POLL_RESOURCES_MS);
  if (q.loading) return <LoadingBlock rows={4} />;
  if (!q.data) return <ErrorState message={q.error?.message ?? 'Could not load volunteers.'} onRetry={q.refresh} />;
  if (q.data.length === 0) return <EmptyState title="No volunteers yet" body="Approve an application to add a volunteer." />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[14px]">
        <thead className="border-b border-strong text-muted">
          <tr>
            <th className="px-5 py-3 font-normal">Name</th>
            <th className="px-3 py-3 font-normal">Skills and equipment</th>
            <th className="px-3 py-3 font-normal">Vehicle</th>
            <th className="px-3 py-3 font-normal">Status</th>
            <th className="px-5 py-3 font-normal">Contact</th>
          </tr>
        </thead>
        <tbody>
          {q.data.map((v) => {
            const wa = whatsappLink(v.phone, `Hello ${v.name}, this is the HopeGrid coordination team.`);
            return (
              <tr key={v.id} className="border-b border-strong last:border-0 align-top">
                <td className="px-5 py-3"><span className="font-medium text-ink">{v.name}</span><br /><span className="t-caption">{v.email}</span></td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1">
                  {v.skills.map((s) => <Tag key={s}>{SKILL_LABEL[s]}</Tag>)}
                  {v.equipment.map((e) => <Tag key={e} tone="info">{EQUIPMENT_LABEL[e]}</Tag>)}
                </div></td>
                <td className="px-3 py-3">{VEHICLE_LABEL[v.vehicle]}</td>
                <td className="px-3 py-3"><Tag tone={v.availability === 'AVAILABLE' ? 'ok' : v.availability === 'BUSY' ? 'lime' : 'neutral'}>{AVAILABILITY_LABEL[v.availability]}</Tag></td>
                <td className="px-5 py-3">{v.phone ?? <span className="text-muted">No phone</span>}{wa && <><br /><a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px]"><IconPhone size={13} /> WhatsApp</a></>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
