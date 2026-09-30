// S07 Admin dashboard — priority counters, auto-dispatch switch (F28), filters and the incident queue (features.md F12,
// BR-120).
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DISPATCH_MAX_RESPONSE_MINUTES, DISPATCH_MAX_THRESHOLD, POLL_ADMIN_MS } from '../../../shared/constants';
import {
  ApiError, INCIDENT_TYPES, PRIORITY_LEVELS,
  type DispatchMode, type DispatchSettings, type IncidentListItem, type IncidentStatus, type IncidentType,
} from '../../../shared/types';
import { ConfidenceBadge, PriorityBadge, StatusBadge, Tag } from '../../components/Badges';
import { Layout } from '../../components/Layout';
import { Button, EmptyState, ErrorState, Field, FreshnessLine, LoadingBlock, PageHeader, timeAgo, useToast } from '../../components/ui';
import { api } from '../../data';
import { usePoll } from '../../hooks/usePoll';
import { PRIORITY_LABEL, TYPE_ICON, TYPE_LABEL } from '../../lib/labels';

type StatusFilter = 'ACTIVE' | 'ALL' | IncidentStatus;
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'Open' },
  { value: 'NEW', label: 'New' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];
const COUNTER_STYLE: Record<string, string> = {
  CRITICAL: 'bg-danger text-white',
  HIGH: 'bg-white text-ink',
  MEDIUM: 'bg-white text-ink',
  LOW: 'bg-white text-ink',
};
const COUNTER_DOT: Record<string, string> = { CRITICAL: 'bg-white', HIGH: 'bg-[#e07a10]', MEDIUM: 'bg-[#e8c21a]', LOW: 'bg-success' };

export default function Dashboard() {
  const navigate = useNavigate();
  const q = usePoll(() => api.listIncidents(), POLL_ADMIN_MS, [], true, (onChange, onLive) => api.watchAdmin(() => onChange(), onLive));
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');
  const [type, setType] = useState<IncidentType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  // Highlight incidents that appeared since the first load.
  const firstSeen = useRef<Set<string> | null>(null);
  if (q.data && firstSeen.current === null) firstSeen.current = new Set(q.data.incidents.map((i) => i.id));
  const isNew = (i: IncidentListItem) => firstSeen.current !== null && !firstSeen.current.has(i.id);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.incidents ?? []).filter((i) =>
      (status === 'ALL' || (status === 'ACTIVE' ? ['NEW', 'VERIFIED', 'IN_PROGRESS'].includes(i.status) : i.status === status)) &&
      (type === 'ALL' || i.type === type) &&
      (!s || i.code.toLowerCase().includes(s) || (i.locationText ?? '').toLowerCase().includes(s) || TYPE_LABEL[i.type].toLowerCase().includes(s)),
    );
  }, [q.data, status, type, search]);

  const attention = (q.data?.incidents ?? []).filter((i) => (i.escalationRecommended && !i.escalated) || i.needsReassign || i.readyToResolve || i.possibleDuplicateCode).length;

  return (
    <Layout variant="admin" width="wide">
      <PageHeader
        title="Incidents"
        subtitle={q.data ? `${attention} ${attention === 1 ? 'incident needs' : 'incidents need'} a decision` : 'Live queue of reported incidents'}
        actions={<FreshnessLine lastUpdated={q.lastUpdated} stale={q.stale} onRefresh={q.refresh} />}
      />

      {q.loading ? (
        <LoadingBlock rows={5} />
      ) : !q.data ? (
        <ErrorState message={q.error?.message ?? 'Could not load incidents.'} onRetry={q.refresh} />
      ) : (
        <div className="flex flex-col gap-5">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Open incidents by priority">
            {PRIORITY_LEVELS.slice().reverse().map((p) => (
              <div key={p} className={`rounded-[16px] px-5 py-4 ${COUNTER_STYLE[p]}`}>
                <p className="flex items-center gap-2 text-[14px] opacity-90"><span className={`h-2.5 w-2.5 rounded-full ${COUNTER_DOT[p]}`} />{PRIORITY_LABEL[p]}</p>
                <p className="mt-1 font-display text-[40px] leading-none tracking-[-0.8px] tabular-nums">{q.data!.counts[p]}</p>
              </div>
            ))}
          </section>

          <DispatchPanel />

          <section className="flex flex-col gap-3 lg:flex-row lg:items-center" aria-label="Filters">
            <div className="flex gap-1 overflow-x-auto rounded-full bg-white p-1" role="group" aria-label="Status">
              {STATUS_FILTERS.map((f) => (
                <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => setStatus(f.value)}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14px] ${status === f.value ? 'bg-ink text-white' : 'text-body hover:bg-canvas'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex flex-1 gap-2">
              <label className="sr-only" htmlFor="type-filter">Type</label>
              <select id="type-filter" className="input max-w-[200px]" value={type} onChange={(e) => setType(e.target.value as IncidentType | 'ALL')}>
                <option value="ALL">All types</option>
                {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
              <label className="sr-only" htmlFor="search">Search</label>
              <input id="search" className="input" placeholder="Search code, place or type" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </section>

          {rows.length === 0 ? (
            <EmptyState
              title={q.data.incidents.length === 0 ? 'No incidents yet' : 'Nothing matches these filters'}
              body={q.data.incidents.length === 0 ? 'New reports appear here within seconds of being sent.' : 'Try another status or type.'}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="card hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-[14px]">
                  <thead className="border-b border-strong text-muted">
                    <tr>
                      <th className="px-5 py-3 font-normal">Priority</th>
                      <th className="px-3 py-3 font-normal">Incident</th>
                      <th className="px-3 py-3 font-normal">People</th>
                      <th className="px-3 py-3 font-normal">Confidence</th>
                      <th className="px-3 py-3 font-normal">Status</th>
                      <th className="px-3 py-3 font-normal">Flags</th>
                      <th className="px-5 py-3 text-right font-normal">Reported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => (
                      <tr key={i.id} onClick={() => navigate(`/admin/incidents/${i.id}`)} className={`cursor-pointer border-b border-strong last:border-0 hover:bg-[#fafafa] ${isNew(i) ? 'bg-[#f7fbe3]' : ''}`}>
                        <td className="px-5 py-3.5 align-top"><PriorityBadge level={i.priority} overridden={i.overridden} /></td>
                        <td className="px-3 py-3.5 align-top">
                          <Link to={`/admin/incidents/${i.id}`} className="font-medium text-ink no-underline hover:underline" onClick={(e) => e.stopPropagation()}>
                            {TYPE_ICON[i.type]} {TYPE_LABEL[i.type]} <span className="font-normal text-muted">#{i.code}</span>
                          </Link>
                          <p className="t-caption mt-0.5 max-w-[34ch] truncate">{i.locationText ?? 'Location from GPS only'}</p>
                        </td>
                        <td className="px-3 py-3.5 align-top tabular-nums">{i.people ?? '—'}</td>
                        <td className="px-3 py-3.5 align-top"><ConfidenceBadge score={i.confidence} band={i.confidenceBand} /><p className="t-caption mt-1">{i.reportCount} {i.reportCount === 1 ? 'report' : 'reports'}</p></td>
                        <td className="px-3 py-3.5 align-top"><StatusBadge status={i.status} /></td>
                        <td className="px-3 py-3.5 align-top"><Flags i={i} fresh={isNew(i)} /></td>
                        <td className="px-5 py-3.5 text-right align-top t-caption whitespace-nowrap">{timeAgo(i.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile / tablet cards */}
              <ul className="flex flex-col gap-2 lg:hidden">
                {rows.map((i) => (
                  <li key={i.id}>
                    <Link to={`/admin/incidents/${i.id}`} className={`card block p-4 text-body no-underline ${isNew(i) ? 'ring-2 ring-lime' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{TYPE_ICON[i.type]} {TYPE_LABEL[i.type]} <span className="font-normal text-muted">#{i.code}</span></p>
                          <p className="t-caption truncate">{i.locationText ?? 'Location from GPS only'}, {timeAgo(i.createdAt)}</p>
                        </div>
                        <PriorityBadge level={i.priority} overridden={i.overridden} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <StatusBadge status={i.status} />
                        <ConfidenceBadge score={i.confidence} band={i.confidenceBand} />
                        {i.people !== null && <Tag>{i.people} people</Tag>}
                      </div>
                      <div className="mt-2"><Flags i={i} fresh={isNew(i)} /></div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Layout>
  );
}

function Flags({ i, fresh }: { i: IncidentListItem; fresh: boolean }) {
  const flags = [
    fresh && <Tag key="new" tone="lime">New</Tag>,
    i.escalationRecommended && !i.escalated && <Tag key="esc" tone="critical">⚠️ Escalation recommended</Tag>,
    i.escalated && <Tag key="escd" tone="neutral">Escalated</Tag>,
    i.possibleDuplicateCode && <Tag key="dup" tone="info">🔗 Possible duplicate of #{i.possibleDuplicateCode}</Tag>,
    i.needsReassign && <Tag key="re" tone="high">↻ Needs reassignment</Tag>,
    i.readyToResolve && <Tag key="rr" tone="ok">✓ Ready to resolve</Tag>,
    i.hasVoice && <Tag key="v">🎤 Voice</Tag>,
    i.viaSms && <Tag key="sms" tone="info">✉️ SMS</Tag>,
  ].filter(Boolean);
  if (flags.length === 0) return <span className="t-caption">—</span>;
  return <div className="flex flex-wrap gap-1.5">{flags}</div>;
}

const MODES: { value: DispatchMode; label: string }[] = [
  { value: 'OFF', label: 'Off' },
  { value: 'OVERLOAD', label: 'When overloaded' },
  { value: 'ALWAYS', label: 'Always' },
];

/** F28 — coordinators choose when the system sends volunteers by itself (BR-160…BR-162). */
function DispatchPanel() {
  const toast = useToast();
  const q = usePoll(() => api.getDispatch(), POLL_ADMIN_MS);
  const [draft, setDraft] = useState<DispatchSettings | null>(null);
  const [saving, setSaving] = useState(false);
  if (!q.data) return null;
  const saved = q.data.settings;
  const s = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<DispatchSettings>) => setDraft({ ...s, ...patch });
  const num = (v: string) => (/^\d+$/.test(v) ? Number(v) : 0);
  const { waiting, pendingOffers } = q.data;

  const status = saved.mode === 'OFF'
    ? 'Off: coordinators assign every volunteer.'
    : saved.mode === 'ALWAYS'
      ? 'On: every waiting incident is sent to the best-matched volunteer.'
      : waiting > saved.threshold
        ? `Overloaded (${waiting} waiting, more than ${saved.threshold}): sending volunteers automatically.`
        : `Standing by: starts when more than ${saved.threshold} incidents are waiting (${waiting} now).`;

  async function save() {
    setSaving(true);
    try {
      q.setData(await api.saveDispatch(s));
      setDraft(null);
      toast(s.mode === 'OFF' ? 'Auto-dispatch is off' : 'Auto-dispatch saved');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`card card-pad flex flex-col gap-4 ${saved.mode !== 'OFF' ? 'ring-2 ring-ink' : ''}`} aria-labelledby="dispatch-h">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="dispatch-h" className="t-title-sm">Auto-dispatch</h2>
          <p className="mt-1 t-body-sm text-muted">{status}{pendingOffers > 0 && ` ${pendingOffers} SOS ${pendingOffers === 1 ? 'is' : 'are'} waiting for an answer.`}</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Auto-dispatch mode">
          {MODES.map((m) => (
            <button key={m.value} type="button" className="chip" aria-pressed={s.mode === m.value} onClick={() => set({ mode: m.value })}>{m.label}</button>
          ))}
        </div>
      </div>
      {s.mode !== 'OFF' && (
        <div className="flex flex-wrap items-end gap-4">
          {s.mode === 'OVERLOAD' && (
            <Field label="Start when more incidents are waiting than" htmlFor="dispatch-threshold">
              <input id="dispatch-threshold" className="input w-28" type="number" inputMode="numeric" min={1} max={DISPATCH_MAX_THRESHOLD} value={s.threshold || ''} onChange={(e) => set({ threshold: num(e.target.value) })} />
            </Field>
          )}
          <Field label="Volunteer must answer within (minutes)" htmlFor="dispatch-minutes">
            <input id="dispatch-minutes" className="input w-28" type="number" inputMode="numeric" min={1} max={DISPATCH_MAX_RESPONSE_MINUTES} value={s.responseMinutes || ''} onChange={(e) => set({ responseMinutes: num(e.target.value) })} />
          </Field>
        </div>
      )}
      {s.mode !== 'OFF' && (
        <p className="t-caption">
          The best-matched available volunteer gets an SOS in the app, by SMS and as a notification. No answer in time counts as a decline and it goes to the next volunteer. You can cancel or reassign at any time; auto-sent incidents stay off the public map until you verify them or the volunteer arrives.
        </p>
      )}
      {dirty && (
        <div className="flex gap-2">
          <Button size="sm" busy={saving} onClick={save}>Save</Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => setDraft(null)}>Undo</Button>
        </div>
      )}
    </section>
  );
}
