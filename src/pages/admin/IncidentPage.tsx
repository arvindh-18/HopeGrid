// S08 Incident page — everything the coordinator needs to decide and act (features.md F13–F16, F18, F21).
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { POLL_ADMIN_MS, POLL_RESOURCE_PICKER_MS } from '../../../shared/constants';
import { formatDistance } from '../../../shared/linking';
import {
  ACTIVE_ASSIGNMENT, ACTIVE_STATUSES, ApiError, INCIDENT_TYPES, NEEDS, PRIORITY_LEVELS,
  type AdminReport, type IncidentDetail, type IncidentPatch, type Need, type PriorityLevel, type Resource, type VolunteerSuggestion,
} from '../../../shared/types';
import { AssignmentBadge, ConfidenceBadge, PriorityBadge, StatusBadge, Tag } from '../../components/Badges';
import { ChatBox } from '../../components/ChatBox';
import { IconArrowLeft, IconExternal, IconMic, IconPhone, IconPin } from '../../components/Icons';
import { Layout } from '../../components/Layout';
import { Modal } from '../../components/Modal';
import { ReasonList } from '../../components/ReasonList';
import { Button, ErrorState, Field, FreshnessLine, LoadingBlock, Notice, Section, Spinner, clockTime, timeAgo, useToast } from '../../components/ui';
import { api } from '../../data';
import { usePoll } from '../../hooks/usePoll';
import { mapsLink } from '../../lib/geo';
import { publicWebUrl } from '../../lib/serverUrl';
import { assignmentMessage, whatsappLink } from '../../lib/whatsapp';
import { HELP_KIND_LABEL, NEED_LABEL, PRIORITY_LABEL, TYPE_ICON, TYPE_LABEL } from '../../lib/labels';

type ModalKind =
  | null | 'verify' | 'reject' | 'resolve' | 'escalate' | 'override' | 'edit' | 'merge' | 'allocate'
  | { assign: VolunteerSuggestion } | { cancel: string };

export default function IncidentPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  // Live: refresh when this incident changes (other changes, e.g. volunteer availability, arrive with the fallback poll).
  const q = usePoll(() => api.getIncident(id), POLL_ADMIN_MS, [id], true,
    (onChange, onLive) => api.watchAdmin((changed) => { if (!changed || changed === id) onChange(); }, onLive));
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const close = () => { setModal(null); setModalError(null); };

  /** Runs an admin action, shows the result immediately, then closes the modal. */
  async function act(fn: () => Promise<IncidentDetail>, done: string) {
    setBusy(true);
    setModalError(null);
    try {
      const d = await fn();
      if (d.id !== id) navigate(`/admin/incidents/${d.id}`, { replace: true }); // merged into another incident
      else q.setData(d);
      toast(done);
      close();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'The action failed. Try again.';
      if (modal) setModalError(msg);
      else toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  const back = <Link to="/admin" className="inline-flex items-center gap-1.5 text-[14px] text-muted no-underline hover:text-ink"><IconArrowLeft size={16} /> All incidents</Link>;

  if (q.loading) return <Layout variant="admin" width="wide">{back}<div className="mt-6"><LoadingBlock rows={6} /></div></Layout>;
  if (!q.data) {
    return (
      <Layout variant="admin" width="wide">
        {back}
        <div className="mt-6"><ErrorState message={q.error?.message ?? 'Could not load this incident.'} onRetry={q.error?.code === 'NOT_FOUND' ? undefined : q.refresh} /></div>
      </Layout>
    );
  }

  const d = q.data;
  const open = ACTIVE_STATUSES.includes(d.status);
  const activeAsg = d.assignments.find((a) => ACTIVE_ASSIGNMENT.includes(a.status));
  const canAssign = (d.status === 'NEW' || d.status === 'VERIFIED') && !activeAsg;

  return (
    <Layout variant="admin" width="wide">
      <div className="mb-3">{back}</div>

      {/* ---------- Header + primary actions ---------- */}
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="t-title-lg">{TYPE_ICON[d.type]} {TYPE_LABEL[d.type]} <span className="text-muted">#{d.code}</span></h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={d.status} />
            <PriorityBadge level={d.priority} overridden={d.overridden} />
            <ConfidenceBadge score={d.confidence} band={d.confidenceBand} />
            {d.escalated && <Tag tone="neutral">Escalated {d.escalatedAt ? clockTime(d.escalatedAt) : ''}</Tag>}
            <span className="t-caption">Reported {timeAgo(d.createdAt)}</span>
          </div>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            {!d.verifiedAt && <Button variant="lime" onClick={() => setModal('verify')}>Verify</Button>}
            <Button variant="primary" onClick={() => setModal('resolve')}>Resolve</Button>
            <Button variant="outline" onClick={() => setModal('edit')}>Edit details</Button>
            <Button variant="outline" onClick={() => setModal('override')}>Change priority</Button>
            {!d.escalated && <Button variant="outline" onClick={() => setModal('escalate')}>Escalate</Button>}
            <Button variant="ghost" className="text-danger" onClick={() => setModal('reject')}>Reject</Button>
          </div>
        )}
      </header>

      <div className="mb-4"><FreshnessLine lastUpdated={q.lastUpdated} stale={q.stale} onRefresh={q.refresh} /></div>

      {/* ---------- Decision banners ---------- */}
      <div className="mb-5 flex flex-col gap-3">
        {!open && (
          <Notice tone={d.status === 'RESOLVED' ? 'success' : 'info'}>
            {d.status === 'RESOLVED' && `Resolved ${d.resolvedAt ? timeAgo(d.resolvedAt) : ''}. No further actions are possible.`}
            {d.status === 'REJECTED' && `Rejected: ${d.rejectReason ?? 'no reason given'}. The reporter sees that the report could not be verified.`}
            {d.status === 'MERGED' && 'This incident was merged into another one. See the timeline for the target code.'}
          </Notice>
        )}
        {open && d.possibleDuplicate && (
          <Notice tone="info" action={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setModal('merge')}>Merge</Button>
              <Button size="sm" variant="outline" busy={busy} onClick={() => act(() => api.dismissDuplicate(d.id), 'Marked as not a duplicate')}>Not a duplicate</Button>
            </div>
          }>
            <span className="font-medium">🔗 Possible duplicate of <Link to={`/admin/incidents/${d.possibleDuplicate.id}`}>#{d.possibleDuplicate.code}</Link></span>
            <span className="block text-muted">{TYPE_LABEL[d.possibleDuplicate.type]}{d.possibleDuplicate.distanceM !== null ? `, ${formatDistance(d.possibleDuplicate.distanceM)} away` : ''}{d.possibleDuplicate.summary ? `: "${d.possibleDuplicate.summary}"` : ''}</span>
          </Notice>
        )}
        {open && d.escalationRecommended && !d.escalated && (
          <Notice tone="danger" action={<Button size="sm" variant="danger" onClick={() => setModal('escalate')}>Escalate</Button>}>
            <span className="font-medium">⚠️ Escalation to emergency services recommended</span>
            <span className="block">{d.escalationReasons.map((r) => r.label).join(', ')}</span>
          </Notice>
        )}
        {d.readyToResolve && <Notice tone="success" action={<Button size="sm" onClick={() => setModal('resolve')}>Resolve</Button>}>✓ The volunteer marked their help as done. Ready to resolve.</Notice>}
        {d.needsReassign && <Notice tone="warning">↻ The last volunteer declined or could not continue. Assign someone else below.</Notice>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ---------- Main column ---------- */}
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Situation">
            <p className="text-[17px] leading-relaxed text-ink">{d.summary ?? 'No summary yet.'}</p>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Fact label="People">{d.people ?? 'Unknown'}</Fact>
              <Fact label="Trapped">{d.trapped ? 'Yes' : 'No'}</Fact>
              <Fact label="Vulnerable person">{d.vulnerable ? 'Yes' : 'No'}</Fact>
              <Fact label="Medical need">{d.medical ? 'Yes' : 'No'}</Fact>
              <Fact label="Immediate danger">{d.danger ? 'Yes' : 'No'}</Fact>
              <div className="col-span-2 sm:col-span-3">
                <dt className="t-caption">Needs</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">{d.needs.length ? d.needs.map((n) => <Tag key={n}>{NEED_LABEL[n]}</Tag>) : <span className="t-body-sm text-muted">None stated</span>}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] bg-canvas px-4 py-3 t-body-sm">
              <IconPin size={18} />
              <span className="flex-1">{d.locationText ?? 'No written location'}{d.publicArea && <span className="text-muted"> (shown publicly as "{d.publicArea}")</span>}</span>
              {d.lat !== null && d.lng !== null && (
                <a href={mapsLink(d.lat, d.lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link">Open in Maps <IconExternal size={14} /></a>
              )}
            </div>
          </Section>

          <Section title={`Reports (${d.reports.length})`}>
            <div className="flex flex-col gap-4">
              {d.reports.map((r) => <ReportCard key={r.id} r={r} />)}
            </div>
          </Section>

          {d.chats.some((c) => c.messages.length > 0) && (
            <Section title="Chat between volunteer and reporters">
              <ChatBox threads={d.chats} open={false} viewer="ADMIN" />
            </Section>
          )}

          <Section title="Timeline">
            <ol className="flex flex-col">
              {d.logs.map((l, i) => (
                <li key={i} className="grid grid-cols-[72px_1fr_auto] items-baseline gap-3 border-b border-strong py-2.5 last:border-0">
                  <span className="t-caption tabular-nums">{clockTime(l.at)}</span>
                  <span className="t-body-sm">{l.text}</span>
                  {l.public && <span className="t-caption" title="The reporter sees this update">Shown to reporter</span>}
                </li>
              ))}
            </ol>
          </Section>
        </div>

        {/* ---------- Side column ---------- */}
        <div className="flex flex-col gap-5">
          <Section title="Volunteer">
            {activeAsg ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 rounded-[12px] bg-canvas px-4 py-3">
                  <div>
                    <p className="font-medium text-ink">{activeAsg.volunteerName}{activeAsg.auto && <span className="t-caption ml-2">Auto-dispatch</span>}</p>
                    <p className="t-caption">
                      {activeAsg.auto && activeAsg.status === 'ASSIGNED' && activeAsg.respondBy
                        ? `SOS sent · must answer by ${clockTime(activeAsg.respondBy)}, then it goes to the next volunteer`
                        : `Updated ${timeAgo(activeAsg.updatedAt)}`}
                    </p>
                  </div>
                  <AssignmentBadge status={activeAsg.status} />
                </div>
                <WhatsAppButton
                  phone={activeAsg.volunteerPhone}
                  message={assignmentMessage({
                    typeLabel: TYPE_LABEL[d.type], priorityLabel: PRIORITY_LABEL[d.priority], incidentCode: d.code,
                    area: d.publicArea ?? d.locationText, url: `${publicWebUrl()}/volunteer/assignments/${activeAsg.id}`,
                  })}
                />
                <Button variant="outline" size="sm" className="self-start" onClick={() => setModal({ cancel: activeAsg.id })}>Cancel assignment</Button>
              </div>
            ) : canAssign ? (
              d.suggestions.length === 0 ? (
                <p className="t-body-sm text-muted">No volunteers are available right now. Volunteers who declined this incident are not suggested again.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {d.suggestions.map((s, i) => (
                    <li key={s.volunteerId} className={`rounded-[12px] border px-4 py-3 ${i === 0 ? 'border-ink' : 'border-strong'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-ink">{s.name}{i === 0 && <span className="t-caption ml-2">Best match</span>}</p>
                        <span className="font-display text-[20px] tabular-nums text-ink">{s.score}</span>
                      </div>
                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 t-caption">
                        {s.reasons.map((r) => <li key={r} className="text-success">{r}</li>)}
                        {s.missing.map((r) => <li key={r} className="text-[#9e2a10]">{r}</li>)}
                      </ul>
                      <Button size="sm" variant={i === 0 ? 'primary' : 'outline'} className="mt-3" onClick={() => setModal({ assign: s })}>Assign {s.name}</Button>
                    </li>
                  ))}
                </ol>
              )
            ) : (
              <p className="t-body-sm text-muted">{open ? 'Volunteers can be assigned while the incident is new or verified.' : 'No volunteer is active on this incident.'}</p>
            )}
            {d.assignments.filter((a) => a.id !== activeAsg?.id).length > 0 && (
              <div className="mt-4 border-t border-strong pt-3">
                <p className="t-caption mb-2">Earlier assignments</p>
                <ul className="flex flex-col gap-1.5">
                  {d.assignments.filter((a) => a.id !== activeAsg?.id).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 t-body-sm">
                      <span>{a.volunteerName}{a.reason ? <span className="text-muted">, {a.reason.toLowerCase().replace(/_/g, ' ')}</span> : ''}</span>
                      <AssignmentBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <CommunityHelp d={d} busy={busy} act={act} />

          <Section title="Priority" aside={<PriorityBadge level={d.priority} overridden={d.overridden} />}>
            <p className="t-caption mb-2">How urgent — score {d.priorityScore}{d.overridden ? `, calculated level ${PRIORITY_LABEL[d.computedPriority]}` : ''}</p>
            <ReasonList reasons={d.priorityReasons} />
            {d.overridden && <p className="mt-3 rounded-[10px] bg-canvas px-3 py-2 t-body-sm">Set by coordinator: {d.overrideReason}</p>}
          </Section>

          <Section title="Confidence" aside={<ConfidenceBadge score={d.confidence} band={d.confidenceBand} />}>
            <p className="t-caption mb-2">How reliable the information is</p>
            <ReasonList reasons={d.confidenceReasons} />
          </Section>

          <Section title="Relief supplies" aside={open && <Button size="sm" variant="outline" onClick={() => setModal('allocate')}>Allocate</Button>}>
            {d.allocations.length === 0 ? (
              <p className="t-body-sm text-muted">Nothing allocated yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {d.allocations.map((a) => <li key={a.id} className="flex justify-between t-body-sm"><span>{a.quantity} {a.unit} {a.resourceName.toLowerCase()}</span><span className="t-caption">{clockTime(a.createdAt)}</span></li>)}
              </ul>
            )}
          </Section>

          <Section title="Related incidents">
            {d.related.length === 0 ? (
              <p className="t-body-sm text-muted">No connected hazards nearby.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {d.related.map((r) => (
                  <li key={r.id}>
                    <Link to={`/admin/incidents/${r.id}`} className="flex items-center gap-3 rounded-[12px] bg-canvas px-3 py-2.5 text-body no-underline hover:bg-strong">
                      <span className="text-[18px]">{TYPE_ICON[r.type]}</span>
                      <span className="t-body-sm">{r.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      {modal === 'verify' && <VerifyModal open d={d} busy={busy} error={modalError} onClose={close} onConfirm={(area) => act(() => api.verifyIncident(d.id, area), 'Incident verified')} />}
      {modal === 'reject' && <ReasonModal open title="Reject this report?" label="Reason" required confirm="Reject" danger busy={busy} error={modalError} onClose={close}
        intro="The reporter will be told the report could not be verified, and to call the emergency number if still in danger. Any active assignment is cancelled."
        onConfirm={(r) => act(() => api.rejectIncident(d.id, r), 'Report rejected')} />}
      {modal === 'resolve' && <ReasonModal open title="Resolve this incident?" label="Resolution note" confirm="Resolve" busy={busy} error={modalError} onClose={close}
        intro={activeAsg ? `${activeAsg.volunteerName}'s active assignment will be cancelled.` : 'The reporter and the public map will show this as resolved.'}
        onConfirm={(n) => act(() => api.resolveIncident(d.id, n), 'Incident resolved')} />}
      {modal === 'escalate' && <ReasonModal open title="Escalate to emergency services?" label="Note for the log" confirm="Mark as escalated" busy={busy} error={modalError} onClose={close}
        intro={<>This is simulated: no one is contacted automatically. Call emergency services yourself, then record it here.{d.escalationReasons.length > 0 && <span className="mt-2 block">Why: {d.escalationReasons.map((r) => r.label).join(', ')}.</span>}</>}
        onConfirm={(n) => act(() => api.escalateIncident(d.id, n), 'Marked as escalated')} />}
      {modal === 'override' && <OverrideModal open d={d} busy={busy} error={modalError} onClose={close}
        onConfirm={(level, reason) => act(() => api.overridePriority(d.id, level, reason), level ? 'Priority changed' : 'Override removed')} />}
      {modal === 'edit' && <EditModal open d={d} busy={busy} error={modalError} onClose={close} onConfirm={(p) => act(() => api.editIncident(d.id, p), 'Details saved')} />}
      {d.possibleDuplicate && modal === 'merge' && (
        <MergeModal open d={d} busy={busy} error={modalError} onClose={close}
          onConfirm={(into) => act(() => (into === 'other' ? api.mergeIncident(d.id, d.possibleDuplicate!.id) : api.mergeIncident(d.possibleDuplicate!.id, d.id)), 'Incidents merged')} />
      )}
      {modal === 'allocate' && <AllocateModal open busy={busy} error={modalError} onClose={close} onConfirm={(rid, qty) => act(() => api.allocateResource(d.id, rid, qty), 'Supplies allocated')} />}
      {modal && typeof modal === 'object' && 'assign' in modal && (
        <Modal open title={`Assign ${modal.assign.name}?`} onClose={close} size="sm" footer={<>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button busy={busy} onClick={() => act(() => api.assignVolunteer(d.id, modal.assign.volunteerId), `${modal.assign.name} assigned`)}>Assign</Button>
        </>}>
          {!d.verifiedAt && <div className="mb-3"><Notice tone="warning">This incident is not verified yet.</Notice></div>}
          <p className="t-body-sm">{modal.assign.name} will get the request and can accept or decline. Their phone and the reporter's phone are never shared.</p>
          {modalError && <p className="mt-3 text-[14px] text-danger" role="alert">{modalError}</p>}
        </Modal>
      )}
      {modal && typeof modal === 'object' && 'cancel' in modal && (
        <Modal open title="Cancel this assignment?" onClose={close} size="sm" footer={<>
          <Button variant="ghost" onClick={close}>Keep assignment</Button>
          <Button variant="danger" busy={busy} onClick={() => act(() => api.cancelAssignment(modal.cancel), 'Assignment cancelled')}>Cancel assignment</Button>
        </>}>
          <p className="t-body-sm">The volunteer becomes available again and the chat closes. You can then assign someone else.</p>
          {modalError && <p className="mt-3 text-[14px] text-danger" role="alert">{modalError}</p>}
        </Modal>
      )}
    </Layout>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="t-caption">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-ink">{children}</dd>
    </div>
  );
}

function ReportCard({ r }: { r: AdminReport }) {
  const x = r.extraction;
  return (
    <article className="rounded-[12px] border border-strong p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-ink">{r.label}</p>
        <div className="flex flex-wrap items-center gap-2">
          {r.channel === 'SMS' && <Tag tone="info">✉️ By SMS</Tag>}
          {r.processingStatus === 'PENDING' && <Tag tone="info"><Spinner size={12} /> Processing</Tag>}
          {r.aiSource && <Tag tone={r.aiSource === 'AI' ? 'lime' : 'neutral'}>{r.aiSource === 'AI' ? 'Structured by AI' : 'Structured by keywords'}</Tag>}
          <span className="t-caption">{clockTime(r.createdAt)}{r.receivedAt.slice(0, 16) !== r.createdAt.slice(0, 16) ? `, received ${clockTime(r.receivedAt)}` : ''}</span>
        </div>
      </div>
      {r.text && <p className="mt-2 whitespace-pre-line text-[15px]">"{r.text}"</p>}
      {r.pendingMedia.length > 0 && (
        <p className="mt-2 t-body-sm text-[#924400]">
          The {r.pendingMedia.map((m) => (m === 'AUDIO' ? 'voice note' : 'photo')).join(' and ')} could not go by SMS. It is still on the reporter's phone and uploads when that phone is online.
        </p>
      )}
      {r.completedAt && <p className="mt-2 t-caption">Full report arrived from the app at {clockTime(r.completedAt)}.</p>}
      {r.audioUrl && (
        <div className="mt-3 rounded-[10px] bg-canvas p-3">
          <p className="mb-2 flex items-center gap-2 t-caption"><IconMic size={14} /> Voice note{r.audioSeconds ? `, ${r.audioSeconds} s` : ''}</p>
          <audio controls src={r.audioUrl} className="h-9 w-full max-w-sm" />
          <p className="mt-2 t-body-sm">
            {r.transcriptStatus === 'DONE' && (() => {
              const [said, english] = (r.transcript ?? '').split('\n\nEnglish: '); // BR-12: original, then the English version
              return <>Transcript: "{said}"{english && <span className="mt-1 block">English: "{english}"</span>}</>;
            })()}
            {r.transcriptStatus === 'FAILED' && <span className="text-[#924400]">Transcription failed — listen to the recording.</span>}
            {r.transcriptStatus === 'NONE' && <span className="text-muted">Transcribing…</span>}
          </p>
        </div>
      )}
      {r.photoUrl && <img src={r.photoUrl} alt={`Photo from ${r.label}`} className="mt-3 max-h-64 rounded-[10px] object-cover" />}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 t-caption">
        {r.phone && <span className="inline-flex items-center gap-1"><IconPhone size={13} /> {r.phone} {r.phoneVerified ? <span className="text-success">(verified)</span> : '(not verified)'}</span>}
        {r.locationText && <span>Location: {r.locationText}</span>}
        {r.people !== null && <span>People (from form): {r.people}</span>}
        {r.needs.length > 0 && <span>Asked for: {r.needs.map((n) => NEED_LABEL[n]).join(', ')}</span>}
      </div>
      {x && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-strong pt-3">
          <Tag>{TYPE_LABEL[x.type]}</Tag>
          {x.people !== null && <Tag>{x.people} people</Tag>}
          {x.trapped && <Tag tone="critical">Trapped</Tag>}
          {(x.vulnerable || x.mobilityIssue) && <Tag tone="high">Vulnerable</Tag>}
          {x.medical && <Tag tone="high">Medical</Tag>}
          {x.danger && <Tag tone="medium">Danger</Tag>}
          {x.places.map((p) => <Tag key={p} tone="info">📍 {p}</Tag>)}
        </div>
      )}
    </article>
  );
}

// ---------------- Modals ----------------
interface BaseModal { open: boolean; busy: boolean; error: string | null; onClose: () => void }

function ModalError({ error }: { error: string | null }) {
  return error ? <p className="mt-3 text-[14px] text-danger" role="alert">{error}</p> : null;
}

function VerifyModal({ d, onConfirm, ...m }: BaseModal & { d: IncidentDetail; onConfirm: (area: string) => void }) {
  const [area, setArea] = useState(d.publicArea ?? '');
  return (
    <Modal open={m.open} title="Verify this incident" onClose={m.onClose} size="sm" footer={<>
      <Button variant="ghost" onClick={m.onClose}>Cancel</Button>
      <Button variant="lime" busy={m.busy} onClick={() => onConfirm(area)}>Verify</Button>
    </>}>
      <p className="t-body-sm">The reporter will see "Verified — arranging help" and the hazard appears on the public map.</p>
      <div className="mt-4">
        <Field label="Area name for the public map" htmlFor="public-area" optional hint="Street or neighbourhood only — never a house number.">
          <input id="public-area" className="input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Central Street" />
        </Field>
      </div>
      <ModalError error={m.error} />
    </Modal>
  );
}

function ReasonModal({ title, intro, label, required, confirm, danger, onConfirm, ...m }: BaseModal & {
  title: string; intro: ReactNode; label: string; required?: boolean; confirm: string; danger?: boolean; onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const missing = required && !text.trim();
  return (
    <Modal open={m.open} title={title} onClose={m.onClose} size="sm" footer={<>
      <Button variant="ghost" onClick={m.onClose}>Cancel</Button>
      <Button variant={danger ? 'danger' : 'primary'} busy={m.busy} onClick={() => { setTried(true); if (!missing) onConfirm(text); }}>{confirm}</Button>
    </>}>
      <p className="t-body-sm">{intro}</p>
      <div className="mt-4">
        <Field label={label} htmlFor="reason-text" optional={!required} error={tried && missing ? `${label} is required.` : null}>
          <textarea id="reason-text" className="input !min-h-[88px]" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </div>
      <ModalError error={m.error} />
    </Modal>
  );
}

function OverrideModal({ d, onConfirm, ...m }: BaseModal & { d: IncidentDetail; onConfirm: (level: PriorityLevel | null, reason?: string) => void }) {
  const [level, setLevel] = useState<PriorityLevel>(d.priority);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <Modal open={m.open} title="Change priority" onClose={m.onClose} size="sm" footer={<>
      {d.overridden && <Button variant="ghost" className="mr-auto" busy={m.busy} onClick={() => onConfirm(null)}>Remove override</Button>}
      <Button variant="ghost" onClick={m.onClose}>Cancel</Button>
      <Button busy={m.busy} onClick={() => { setTried(true); if (reason.trim()) onConfirm(level, reason); }}>Save priority</Button>
    </>}>
      <p className="t-body-sm">Calculated priority is {PRIORITY_LABEL[d.computedPriority]} (score {d.priorityScore}). Your choice replaces it until you remove it.</p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Priority">
        {PRIORITY_LEVELS.slice().reverse().map((p) => (
          <button key={p} type="button" role="radio" aria-checked={level === p} className="chip" aria-pressed={level === p} onClick={() => setLevel(p)}>{PRIORITY_LABEL[p]}</button>
        ))}
      </div>
      <div className="mt-4">
        <Field label="Reason" htmlFor="override-reason" error={tried && !reason.trim() ? 'Add a reason for changing the priority.' : null}>
          <input id="override-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Water rising fast, confirmed by phone" />
        </Field>
      </div>
      <ModalError error={m.error} />
    </Modal>
  );
}

function EditModal({ d, onConfirm, ...m }: BaseModal & { d: IncidentDetail; onConfirm: (p: IncidentPatch) => void }) {
  const [f, setF] = useState<IncidentPatch>({
    type: d.type, people: d.people, vulnerable: d.vulnerable, trapped: d.trapped, medical: d.medical, danger: d.danger,
    needs: d.needs, locationText: d.locationText, publicArea: d.publicArea, summary: d.summary,
  });
  const set = <K extends keyof IncidentPatch>(k: K, v: IncidentPatch[K]) => setF((x) => ({ ...x, [k]: v }));
  const flags: { k: 'trapped' | 'vulnerable' | 'medical' | 'danger'; label: string }[] = [
    { k: 'trapped', label: 'Trapped' }, { k: 'vulnerable', label: 'Vulnerable person' }, { k: 'medical', label: 'Medical need' }, { k: 'danger', label: 'Immediate danger' },
  ];
  return (
    <Modal open={m.open} title="Edit details" onClose={m.onClose} size="lg" footer={<>
      <Button variant="ghost" onClick={m.onClose}>Cancel</Button>
      <Button busy={m.busy} onClick={() => onConfirm(f)}>Save changes</Button>
    </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="e-type">
          <select id="e-type" className="input" value={f.type} onChange={(e) => set('type', e.target.value as IncidentPatch['type'])}>
            {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="People" htmlFor="e-people" hint="Leave empty if unknown.">
          <input id="e-people" className="input" type="number" min={0} max={500} value={f.people ?? ''} onChange={(e) => set('people', e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Summary" htmlFor="e-summary">
            <textarea id="e-summary" className="input !min-h-[80px]" value={f.summary ?? ''} onChange={(e) => set('summary', e.target.value || null)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2" role="group" aria-label="Situation">
          {flags.map(({ k, label }) => <button key={k} type="button" className="chip" aria-pressed={!!f[k]} onClick={() => set(k, !f[k])}>{label}</button>)}
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2" role="group" aria-label="Needs">
          {NEEDS.map((n: Need) => (
            <button key={n} type="button" className="chip" aria-pressed={f.needs?.includes(n)} onClick={() => set('needs', f.needs?.includes(n) ? f.needs.filter((x) => x !== n) : [...(f.needs ?? []), n])}>{NEED_LABEL[n]}</button>
          ))}
        </div>
        <Field label="Location description" htmlFor="e-loc">
          <input id="e-loc" className="input" value={f.locationText ?? ''} onChange={(e) => set('locationText', e.target.value || null)} />
        </Field>
        <Field label="Public area name" htmlFor="e-area" hint="Shown on the public map after verification.">
          <input id="e-area" className="input" value={f.publicArea ?? ''} onChange={(e) => set('publicArea', e.target.value || null)} />
        </Field>
      </div>
      <p className="mt-4 t-caption">Saving recalculates priority and confidence.</p>
      <ModalError error={m.error} />
    </Modal>
  );
}

function MergeModal({ d, onConfirm, ...m }: BaseModal & { d: IncidentDetail; onConfirm: (into: 'other' | 'this') => void }) {
  const other = d.possibleDuplicate!;
  const [into, setInto] = useState<'other' | 'this'>('other');
  return (
    <Modal open={m.open} title="Merge incidents" onClose={m.onClose} size="sm" footer={<>
      <Button variant="ghost" onClick={m.onClose}>Cancel</Button>
      <Button busy={m.busy} onClick={() => onConfirm(into)}>Merge</Button>
    </>}>
      <p className="t-body-sm">All reports, chats and assignments move to the incident you keep. Scores are recalculated.</p>
      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="sr-only">Which incident to keep</legend>
        {(['other', 'this'] as const).map((opt) => (
          <label key={opt} className={`flex cursor-pointer items-center gap-3 rounded-[12px] border px-4 py-3 ${into === opt ? 'border-ink' : 'border-strong'}`}>
            <input type="radio" name="merge" checked={into === opt} onChange={() => setInto(opt)} className="accent-black" />
            <span className="t-body-sm">{opt === 'other' ? <>Keep <strong>#{other.code}</strong> (older), merge this one into it</> : <>Keep <strong>#{d.code}</strong> (this one), merge #{other.code} into it</>}</span>
          </label>
        ))}
      </fieldset>
      <ModalError error={m.error} />
    </Modal>
  );
}

function AllocateModal({ onConfirm, ...m }: BaseModal & { onConfirm: (resourceId: string, qty: number) => void }) {
  const res = usePoll<Resource[]>(() => api.listResources(), POLL_RESOURCE_PICKER_MS, [m.open], m.open);
  const [rid, setRid] = useState('');
  const [qty, setQty] = useState('1');
  const chosen = res.data?.find((r) => r.id === rid);
  const n = Number(qty);
  const invalid = !chosen || !Number.isInteger(n) || n < 1 || n > (chosen?.quantity ?? 0);
  return (
    <Modal open={m.open} title="Allocate relief supplies" onClose={m.onClose} size="sm" footer={<>
      <Button variant="ghost" onClick={m.onClose}>Cancel</Button>
      <Button busy={m.busy} disabled={invalid} onClick={() => chosen && onConfirm(chosen.id, n)}>Allocate</Button>
    </>}>
      {res.loading ? <LoadingBlock rows={2} /> : !res.data ? <ErrorState message={res.error?.message ?? 'Could not load resources.'} onRetry={res.refresh} /> : (
        <div className="flex flex-col gap-4">
          <Field label="Resource" htmlFor="a-res">
            <select id="a-res" className="input" value={rid} onChange={(e) => setRid(e.target.value)}>
              <option value="">Choose…</option>
              {res.data.map((r) => <option key={r.id} value={r.id} disabled={r.quantity === 0}>{r.name} ({r.quantity} {r.unit} at {r.locationText})</option>)}
            </select>
          </Field>
          <Field label="Quantity" htmlFor="a-qty" error={chosen && n > chosen.quantity ? `Only ${chosen.quantity} ${chosen.unit} available.` : null}>
            <input id="a-qty" className="input" type="number" min={1} max={chosen?.quantity} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>
      )}
      <ModalError error={m.error} />
    </Modal>
  );
}

/** F14: opens WhatsApp on this device with the volunteer's number and a ready message; the coordinator presses Send. */
function WhatsAppButton({ phone, message }: { phone: string | null; message: string }) {
  const link = whatsappLink(phone, message);
  if (!link) return <p className="t-caption">No phone number on this volunteer's profile, so WhatsApp can't be used.</p>;
  return (
    <a href={link} target="_blank" rel="noreferrer" className="btn btn-sm self-start bg-[#25d366] text-ink no-underline hover:bg-[#1ebe5b]">
      <IconPhone size={16} /> Send on WhatsApp
    </a>
  );
}

/** F29 — offers from the public map, and opening the incident to anyone with a public task (BR-172, BR-173). */
function CommunityHelp({ d, busy, act }: { d: IncidentDetail; busy: boolean; act: (fn: () => Promise<IncidentDetail>, done: string) => Promise<void> }) {
  const [task, setTask] = useState(d.publicTask ?? '');
  const offers = d.helpOffers ?? []; // a server older than F29 sends none
  const pending = offers.filter((o) => o.status === 'PENDING');
  const others = offers.filter((o) => o.status !== 'PENDING');
  const open = ['NEW', 'VERIFIED', 'IN_PROGRESS'].includes(d.status);
  if (!open && offers.length === 0) return null;
  return (
    <Section title="Community help">
      <div className="flex flex-col gap-4">
        {open && (d.openToAll ? (
          <div className="rounded-[12px] bg-canvas px-4 py-3">
            <p className="t-caption">Open to anyone on the public map</p>
            <p className="mt-1 t-body-sm text-ink">"{d.publicTask}"</p>
            <Button size="sm" variant="outline" className="mt-3" busy={busy} onClick={() => act(() => api.setOpenToAll(d.id, false), 'Closed to the public')}>Stop</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Field label="Let anyone join from the map" htmlFor="public-task" hint="For tasks many hands can do: clearing a road, carrying sandbags, handing out food. Everyone can read this, so no names or house details.">
              <textarea id="public-task" className="input min-h-[64px]" maxLength={200} value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. Carry sandbags to the canal wall; meet at the temple gate" />
            </Field>
            <Button size="sm" className="self-start" busy={busy} disabled={task.trim().length < 5} onClick={() => act(() => api.setOpenToAll(d.id, true, task), 'Opened to anyone')}>Open to anyone</Button>
          </div>
        ))}
        {pending.length > 0 && (
          <div>
            <p className="t-caption mb-2">Offers waiting for you ({pending.length})</p>
            <ul className="flex flex-col gap-2">
              {pending.map((o) => (
                <li key={o.id} className="rounded-[12px] border border-strong px-4 py-3">
                  <OfferLine o={o} />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" busy={busy} onClick={() => act(() => api.acceptHelpOffer(o.id), `Accepted ${o.name}'s offer`)}>Accept</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => api.declineHelpOffer(o.id), 'Offer declined')}>Decline</Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {others.length > 0 && (
          <div>
            <p className="t-caption mb-2">Helpers</p>
            <ul className="flex flex-col gap-2">
              {others.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-2 t-body-sm">
                  <OfferLine o={o} />
                  <Tag tone={o.status === 'DECLINED' ? 'neutral' : 'ok'}>{o.status === 'JOINED' ? 'Joined' : o.status === 'ACCEPTED' ? 'Accepted' : 'Declined'}</Tag>
                </li>
              ))}
            </ul>
          </div>
        )}
        {open && offers.length === 0 && !d.openToAll && (
          <p className="t-caption">People who see this on the public map can offer help once it is verified. Offers appear here.</p>
        )}
      </div>
    </Section>
  );
}

function OfferLine({ o }: { o: IncidentDetail['helpOffers'][number] }) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-ink">{o.name} <a className="t-caption ml-1 underline" href={`tel:${o.phone}`}>{o.phone}</a></p>
      {o.kinds.length > 0 && <p className="t-caption">{o.kinds.map((k) => HELP_KIND_LABEL[k]).join(', ')}</p>}
      {o.note && <p className="t-caption">"{o.note}"</p>}
      <p className="t-caption">{timeAgo(o.createdAt)}</p>
    </div>
  );
}
