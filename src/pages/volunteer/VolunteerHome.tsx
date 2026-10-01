// S09 Volunteer home — availability, new requests, the SOS screen for auto-dispatched requests (F28), current
// assignment, skills (features.md F10, F16).
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { POLL_VOLUNTEER_MS } from '../../../shared/constants';
import {
  ACTIVE_ASSIGNMENT, ApiError, EQUIPMENT, SKILLS, UNABLE_REASONS, VEHICLES,
  type Equipment, type Skill, type UnableReason, type Vehicle, type VolunteerAssignment, type VolunteerProfile,
} from '../../../shared/types';
import { AssignmentBadge, PriorityBadge, Tag } from '../../components/Badges';
import { IconArrowRight, IconPin } from '../../components/Icons';
import { Layout } from '../../components/Layout';
import { Modal } from '../../components/Modal';
import { Button, ErrorState, Field, FreshnessLine, LoadingBlock, Notice, Toggle, timeAgo, useToast } from '../../components/ui';
import { api } from '../../data';
import { useAuth } from '../../hooks/useAuth';
import { usePoll } from '../../hooks/usePoll';
import { formatDistance, getPosition } from '../../lib/geo';
import { startPush } from '../../lib/push';
import { distanceBetween } from '../../../shared/linking';
import {
  AVAILABILITY_LABEL, EQUIPMENT_LABEL, NEED_LABEL, SKILL_LABEL, TYPE_ICON, TYPE_LABEL, UNABLE_LABEL, VEHICLE_LABEL,
} from '../../lib/labels';

export default function VolunteerHome() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const profile = usePoll(() => api.getMyProfile(), POLL_VOLUNTEER_MS);
  const asg = usePoll(() => api.listMyAssignments(), POLL_VOLUNTEER_MS, [], true, (onChange, onLive) => api.watchVolunteer(onChange, onLive));
  const [declining, setDeclining] = useState<VolunteerAssignment | null>(null);
  const [editingSkills, setEditingSkills] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const offers = asg.data?.filter((a) => a.status === 'ASSIGNED') ?? [];
  const current = asg.data?.find((a) => ACTIVE_ASSIGNMENT.includes(a.status) && a.status !== 'ASSIGNED') ?? null;
  const recent = asg.data?.filter((a) => !ACTIVE_ASSIGNMENT.includes(a.status)) ?? [];

  // F28: SOS notifications while the app is closed (Android app with Firebase only). The token goes to the server.
  useEffect(() => {
    let stop: (() => void) | undefined;
    void startPush((token) => void api.registerPushToken(token).catch(() => {}), (path) => navigate(path)).then((s) => { stop = s; });
    return () => stop?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // F28: an auto-dispatched request covers the screen until it is accepted or declined.
  const sos = offers.find((o) => o.auto && o.respondBy) ?? null;

  // Alert when a new request arrives (F16).
  const seenOffers = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!asg.data) return;
    const ids = new Set(offers.map((o) => o.id));
    if (seenOffers.current && [...ids].some((id) => !seenOffers.current!.has(id))) {
      (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive && navigator.vibrate?.([200, 100, 200]);
      toast('New help request', 'info');
    }
    seenOffers.current = ids;
  }, [asg.data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function respond(a: VolunteerAssignment, status: 'ACCEPTED' | 'DECLINED', reason?: string) {
    setBusyId(a.id);
    try {
      await api.updateAssignmentStatus(a.id, status, reason);
      await Promise.all([asg.refresh(), profile.refresh()]);
      if (status === 'ACCEPTED') {
        toast('Accepted — the reporter can now message you');
        navigate(`/volunteer/assignments/${a.id}`);
      } else {
        toast('Request declined');
        setDeclining(null);
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not update. Try again.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function setAvailable(v: boolean) {
    try {
      profile.setData(await api.updateMyProfile({ availability: v ? 'AVAILABLE' : 'OFFLINE' }));
      toast(v ? "You're available for requests" : "You won't get new requests");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not change availability.', 'error');
    }
  }

  const p = profile.data;

  return (
    <Layout variant="volunteer">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="t-title-lg">Hi, {user?.name}</h1>
            <FreshnessLine lastUpdated={asg.lastUpdated} stale={asg.stale} onRefresh={asg.refresh} />
          </div>
        </header>

        {profile.loading || asg.loading ? (
          <LoadingBlock rows={3} />
        ) : !p || !asg.data ? (
          <ErrorState message={(profile.error ?? asg.error)?.message ?? 'Could not load your assignments.'} onRetry={() => { void profile.refresh(); void asg.refresh(); }} />
        ) : (
          <>
            <section className="card card-pad flex items-center justify-between gap-4" aria-label="Availability">
              <div>
                <p className="t-title-sm">{AVAILABILITY_LABEL[p.availability]}</p>
                <p className="t-body-sm text-muted">
                  {p.availability === 'BUSY' ? 'Finish your current assignment to change this.' : p.availability === 'AVAILABLE' ? 'Coordinators can send you requests.' : 'Turn on to receive requests.'}
                </p>
              </div>
              <Toggle label="Available for requests" checked={p.availability !== 'OFFLINE'} disabled={p.availability === 'BUSY'} onChange={setAvailable} />
            </section>

            {offers.map((a) => (
              <section key={a.id} className="card overflow-hidden ring-2 ring-ink" aria-labelledby={`offer-${a.id}`}>
                <div className="flex items-center justify-between gap-3 bg-dark px-5 py-3 text-white">
                  <p id={`offer-${a.id}`} className="font-medium">New help request</p>
                  <span className="t-caption !text-white/70">{timeAgo(a.updatedAt)}</span>
                </div>
                <div className="p-5">
                  <IncidentSummary a={a} p={p} />
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <Button variant="lime" size="lg" className="flex-1" busy={busyId === a.id} onClick={() => respond(a, 'ACCEPTED')}>Accept</Button>
                    <Button variant="outline" size="lg" className="flex-1" disabled={busyId === a.id} onClick={() => setDeclining(a)}>Decline</Button>
                  </div>
                </div>
              </section>
            ))}

            {current ? (
              <section className="card card-pad" aria-labelledby="current-h">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="current-h" className="t-title-sm">Current assignment</h2>
                  <AssignmentBadge status={current.status} />
                </div>
                <div className="mt-3"><IncidentSummary a={current} p={p} /></div>
                <Link to={`/volunteer/assignments/${current.id}`} className="btn btn-primary btn-lg btn-block mt-5">Open assignment <IconArrowRight size={18} /></Link>
              </section>
            ) : offers.length === 0 && (
              <section className="card card-pad">
                <h2 className="t-title-sm">No active requests</h2>
                <p className="mt-1 t-body-sm text-muted">{p.availability === 'OFFLINE' ? 'You are marked as not available.' : 'New requests appear here automatically. Keep this page open.'}</p>
                {p.availability === 'AVAILABLE' && (
                  <Link to="/map" className="btn btn-outline btn-sm mt-3">Find hazards that need help on the map</Link>
                )}
              </section>
            )}

            <section className="card card-pad" aria-labelledby="skills-h">
              <div className="flex items-center justify-between gap-3">
                <h2 id="skills-h" className="t-title-sm">Skills and equipment</h2>
                <Button size="sm" variant="outline" onClick={() => setEditingSkills(true)}>Edit</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.skills.map((s) => <Tag key={s}>{SKILL_LABEL[s]}</Tag>)}
                {p.equipment.map((e) => <Tag key={e} tone="info">{EQUIPMENT_LABEL[e]}</Tag>)}
                <Tag tone="neutral">{VEHICLE_LABEL[p.vehicle]}</Tag>
              </div>
              <p className="mt-3 t-caption">Coordinators use these to suggest the right volunteer for each incident.</p>
            </section>

            {recent.length > 0 && (
              <section className="card card-pad" aria-labelledby="recent-h">
                <h2 id="recent-h" className="t-title-sm">Recent</h2>
                <ul className="mt-2 flex flex-col">
                  {recent.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 border-b border-strong py-3 last:border-0">
                      <span className="t-body-sm">{TYPE_ICON[a.incident.type]} {TYPE_LABEL[a.incident.type]} <span className="text-muted">#{a.incident.code}, {timeAgo(a.updatedAt)}</span></span>
                      <AssignmentBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {sos && p && !declining && (
        <SosScreen
          a={sos} p={p} busy={busyId === sos.id}
          onAccept={() => respond(sos, 'ACCEPTED')} onDecline={() => setDeclining(sos)} onTimeUp={() => void asg.refresh()}
        />
      )}
      {declining && (
        <ReasonPicker title="Decline this request?" confirm="Decline" busy={busyId === declining.id} onClose={() => setDeclining(null)} onConfirm={(r) => respond(declining, 'DECLINED', r)} />
      )}
      {editingSkills && p && (
        <SkillsModal p={p} onClose={() => setEditingSkills(false)} onSaved={(np) => { profile.setData(np); setEditingSkills(false); toast('Profile updated'); }} />
      )}
    </Layout>
  );
}

function IncidentSummary({ a, p }: { a: VolunteerAssignment; p: VolunteerProfile }) {
  const i = a.incident;
  const d = distanceBetween(i, p);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="t-title-md">{TYPE_ICON[i.type]} {TYPE_LABEL[i.type]}</p>
        <PriorityBadge level={i.priority} />
      </div>
      {i.summary && <p className="mt-2 text-[15px]">{i.summary}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {i.people !== null && <Tag>{i.people} people</Tag>}
        {i.trapped && <Tag tone="critical">Trapped</Tag>}
        {i.vulnerable && <Tag tone="high">Vulnerable person</Tag>}
        {i.medical && <Tag tone="high">Medical need</Tag>}
        {i.needs.map((n) => <Tag key={n} tone="info">{NEED_LABEL[n]}</Tag>)}
      </div>
      <p className="mt-3 flex items-center gap-1.5 t-body-sm text-muted">
        <IconPin size={16} /> {i.locationText ?? 'Location on map'}{d !== null ? `, ${formatDistance(d)} from you` : ''}
      </p>
    </div>
  );
}

export function ReasonPicker({ title, confirm, busy, onClose, onConfirm }: { title: string; confirm: string; busy: boolean; onClose: () => void; onConfirm: (r: UnableReason) => void }) {
  const [reason, setReason] = useState<UnableReason | null>(null);
  return (
    <Modal open title={title} onClose={onClose} size="sm" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="danger" busy={busy} disabled={!reason} onClick={() => reason && onConfirm(reason)}>{confirm}</Button>
    </>}>
      <p className="t-body-sm">The coordinator will see your reason and find someone else.</p>
      <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="Reason">
        {UNABLE_REASONS.map((r) => (
          <label key={r} className={`flex cursor-pointer items-center gap-3 rounded-[12px] border px-4 py-3 ${reason === r ? 'border-ink' : 'border-strong'}`}>
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-black" />
            <span className="t-body-sm">{UNABLE_LABEL[r]}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

function SkillsModal({ p, onClose, onSaved }: { p: VolunteerProfile; onClose: () => void; onSaved: (p: VolunteerProfile) => void }) {
  const [skills, setSkills] = useState<Skill[]>(p.skills);
  const [equipment, setEquipment] = useState<Equipment[]>(p.equipment);
  const [vehicle, setVehicle] = useState<Vehicle>(p.vehicle);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  async function updateLocation() {
    setLocMsg('Finding your location…');
    try {
      const pos = await getPosition();
      setLoc({ lat: pos.lat, lng: pos.lng });
      setLocMsg(`Location updated (±${pos.accuracy} m)`);
    } catch (e) {
      setLocMsg(e instanceof Error ? e.message : 'Location not available.');
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.updateMyProfile({ skills, equipment, vehicle, ...(loc ?? {}) }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <Modal open title="Skills and equipment" onClose={onClose} size="lg" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button busy={busy} onClick={save}>Save profile</Button>
    </>}>
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-[15px] text-ink">Skills</legend>
          <div className="flex flex-wrap gap-2">{SKILLS.map((s) => <button key={s} type="button" className="chip" aria-pressed={skills.includes(s)} onClick={() => setSkills(toggle(skills, s))}>{SKILL_LABEL[s]}</button>)}</div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-[15px] text-ink">Equipment</legend>
          <div className="flex flex-wrap gap-2">{EQUIPMENT.map((e) => <button key={e} type="button" className="chip" aria-pressed={equipment.includes(e)} onClick={() => setEquipment(toggle(equipment, e))}>{EQUIPMENT_LABEL[e]}</button>)}</div>
        </fieldset>
        <Field label="Vehicle" htmlFor="vehicle">
          <select id="vehicle" className="input max-w-xs" value={vehicle} onChange={(e) => setVehicle(e.target.value as Vehicle)}>
            {VEHICLES.map((v) => <option key={v} value={v}>{VEHICLE_LABEL[v]}</option>)}
          </select>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={updateLocation}><IconPin size={16} /> Update my location</Button>
          {locMsg && <span className="t-caption">{locMsg}</span>}
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  );
}

const secondsUntil = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));

/** F28 — an SOS from auto-dispatch. No close button: it goes away only by Accept, Decline or the deadline (BR-162). */
function SosScreen({ a, p, busy, onAccept, onDecline, onTimeUp }: {
  a: VolunteerAssignment; p: VolunteerProfile; busy: boolean; onAccept: () => void; onDecline: () => void; onTimeUp: () => void;
}) {
  const [left, setLeft] = useState(() => secondsUntil(a.respondBy!));
  useEffect(() => {
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    const t = setInterval(() => {
      const s = secondsUntil(a.respondBy!);
      setLeft(s);
      if (s === 0) onTimeUp(); // the server moves it to the next volunteer within a few seconds
    }, 1000);
    return () => clearInterval(t);
  }, [a.id, a.respondBy]); // eslint-disable-line react-hooks/exhaustive-deps
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="sos-h" aria-describedby="sos-d" className="fixed inset-0 z-[1400] flex flex-col bg-danger text-white">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-5 pt-8">
        <p className="t-caption !text-white/80">SOS · sent automatically</p>
        <h2 id="sos-h" className="t-title-lg">Someone needs your help</h2>
        <p className="font-display text-[56px] leading-none tabular-nums" aria-live="polite">{mm}:{ss}</p>
        <p id="sos-d" className="t-body-sm !text-white/90">
          {left > 0 ? 'Accept or decline before the time runs out. If you do not answer, it goes to the next volunteer.' : 'Time is up. It is going to the next volunteer.'}
        </p>
        <div className="rounded-[16px] bg-white p-4 text-ink"><IncidentSummary a={a} p={p} /></div>
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-2 px-5 pb-6 pt-4">
        <Button variant="lime" size="lg" block busy={busy} onClick={onAccept}>Accept</Button>
        <Button variant="outline" size="lg" block disabled={busy} className="!border-white !bg-transparent !text-white" onClick={onDecline}>Decline</Button>
      </div>
    </div>
  );
}
