// S05 Safety map — anonymised hazards with advice; map or list (features.md F19, F20).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEMO_CENTER, POLL_PUBLIC_MS } from '../../shared/constants';
import { nearbyHazards } from '../../shared/publicView';
import type { PublicIncident } from '../../shared/types';
import { Tag } from '../components/Badges';
import { IconAlert, IconClose, IconList, IconMap } from '../components/Icons';
import { Layout } from '../components/Layout';
import { SafetyMap } from '../components/SafetyMap';
import { EmptyState, ErrorState, FreshnessLine, Notice, Skeleton, timeAgo } from '../components/ui';
import { api } from '../data';
import { usePoll } from '../hooks/usePoll';
import { distanceMeters, formatDistance, getPosition } from '../lib/geo';
import { MARKER_TONE, PRIORITY_LABEL, PUBLIC_STATUS_LABEL, TYPE_ICON, TYPE_LABEL } from '../lib/labels';
import { useAuth } from '../hooks/useAuth';
import { useOnline } from '../offline/useOnline';

const LEGEND: { color: PublicIncident['color']; label: string }[] = [
  { color: 'RED', label: 'Critical' },
  { color: 'ORANGE', label: 'Hazard' },
  { color: 'YELLOW', label: 'Disruption' },
  { color: 'GREEN', label: 'Resolved' },
];

export default function PublicMap() {
  const { user } = useAuth();
  const online = useOnline();
  const feed = usePoll(() => api.getPublicIncidents(), POLL_PUBLIC_MS);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [tilesFailed, setTilesFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getPosition().then((p) => setMe({ lat: p.lat, lng: p.lng })).catch(() => setMe(null));
  }, []);

  const mapUnavailable = tilesFailed || !online;
  const effectiveView = mapUnavailable ? 'list' : view;
  const onTileError = useCallback(() => setTilesFailed(true), []);

  const incidents = useMemo(() => {
    const list = feed.data?.incidents ?? [];
    if (!me) return list;
    return [...list].sort((a, b) => distanceMeters(me.lat, me.lng, a.lat, a.lng) - distanceMeters(me.lat, me.lng, b.lat, b.lng));
  }, [feed.data, me]);
  const nearby = me ? nearbyHazards(incidents, me.lat, me.lng) : [];
  const chosen = incidents.find((i) => i.code === selected) ?? null;

  return (
    <Layout variant={user?.role === 'ADMIN' ? 'admin' : user?.role === 'VOLUNTEER' ? 'volunteer' : 'public'} width="wide">
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="t-title-lg">Safety map</h1>
            <p className="mt-1 text-muted">Reported hazards around you. Exact addresses are never shown.</p>
          </div>
          <div className="flex rounded-full bg-white p-1" role="group" aria-label="View">
            <button type="button" aria-pressed={effectiveView === 'map'} disabled={mapUnavailable} onClick={() => setView('map')}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-[14px] disabled:opacity-40 ${effectiveView === 'map' ? 'bg-ink text-white' : 'text-body'}`}>
              <IconMap size={16} /> Map
            </button>
            <button type="button" aria-pressed={effectiveView === 'list'} onClick={() => setView('list')}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-[14px] ${effectiveView === 'list' ? 'bg-ink text-white' : 'text-body'}`}>
              <IconList size={16} /> List
            </button>
          </div>
        </header>

        {nearby.length > 0 && (
          <Notice tone="danger">
            <span className="flex items-center gap-2 font-medium"><IconAlert size={18} /> {nearby.length} active {nearby.length === 1 ? 'hazard' : 'hazards'} within 2 km</span>
          </Notice>
        )}
        {mapUnavailable && <Notice tone="warning">Map unavailable {online ? '(map images could not load)' : "while you're offline"} — showing a list instead.</Notice>}

        {feed.loading ? (
          <Skeleton className="h-[60vh]" />
        ) : !feed.data ? (
          <ErrorState message={feed.error?.message ?? 'Could not load hazards.'} onRetry={feed.refresh} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            {effectiveView === 'map' && (
              <div className="relative h-[62vh] min-h-[380px] overflow-hidden rounded-[16px] bg-strong">
                <SafetyMap incidents={incidents} center={me ?? DEMO_CENTER} user={me} selected={selected} onSelect={setSelected} onTileError={onTileError} />
                <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-[12px] bg-white/95 px-3 py-2 text-[13px] shadow" aria-label="Legend">
                  {LEGEND.map((l) => (
                    <span key={l.color} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-full pin-${l.color}`} />{l.label}</span>
                  ))}
                </div>
                {chosen && (
                  <div className="absolute inset-x-3 bottom-14 z-[600] lg:hidden">
                    <HazardCard p={chosen} me={me} onClose={() => setSelected(null)} />
                  </div>
                )}
              </div>
            )}

            <aside className={`flex flex-col gap-3 ${effectiveView === 'map' ? 'hidden lg:flex' : 'lg:col-span-2'}`} aria-label="Hazards list">
              {chosen && effectiveView === 'map' && <HazardCard p={chosen} me={me} onClose={() => setSelected(null)} />}
              {incidents.length === 0 ? (
                <EmptyState title="No hazards reported nearby right now" body="This page refreshes on its own. If something is happening, report it." />
              ) : (
                <ul className={`grid gap-2 ${effectiveView === 'list' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'max-h-[56vh] overflow-y-auto'}`}>
                  {incidents.map((p) => (
                    <li key={p.code}>
                      <button type="button" onClick={() => setSelected(p.code)}
                        className={`card flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-[#fafafa] ${selected === p.code ? 'ring-2 ring-ink' : ''}`}>
                        <span className={`hazard-pin pin-${p.color} !h-9 !w-9 flex-none`}>{TYPE_ICON[p.type]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{TYPE_LABEL[p.type]}</span>
                          <span className="t-caption block">{p.area ?? 'Area not confirmed yet'}{me ? `, ${formatDistance(distanceMeters(me.lat, me.lng, p.lat, p.lng))} away` : ''}</span>
                          {effectiveView === 'list' && <span className="mt-2 block t-body-sm">{p.advice}</span>}
                        </span>
                        <Tag tone={MARKER_TONE[p.color]}>{PUBLIC_STATUS_LABEL[p.status]}</Tag>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <FreshnessLine lastUpdated={feed.lastUpdated} stale={feed.stale} onRefresh={feed.refresh} />
            </aside>
          </div>
        )}
      </div>
    </Layout>
  );
}

function HazardCard({ p, me, onClose }: { p: PublicIncident; me: { lat: number; lng: number } | null; onClose: () => void }) {
  return (
    <article className="card relative p-5 shadow-[var(--shadow-float)]" aria-live="polite">
      <button type="button" onClick={onClose} aria-label="Close details" className="absolute right-3 top-3 rounded-full p-1.5 text-muted hover:bg-canvas"><IconClose size={18} /></button>
      <div className="flex items-center gap-3 pr-8">
        <span className={`hazard-pin pin-${p.color} flex-none`}>{TYPE_ICON[p.type]}</span>
        <div>
          <h2 className="t-title-sm">{TYPE_LABEL[p.type]}</h2>
          <p className="t-caption">{p.area ?? 'Area not confirmed yet'}{me ? `, ${formatDistance(distanceMeters(me.lat, me.lng, p.lat, p.lng))} away` : ''}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Tag tone={MARKER_TONE[p.color]} dot>{PUBLIC_STATUS_LABEL[p.status]}</Tag>
        <Tag tone="neutral">{PRIORITY_LABEL[p.priority]} priority</Tag>
        {p.verified ? <Tag tone="ok">Verified</Tag> : <Tag tone="medium">Unverified — {p.reportCount} {p.reportCount === 1 ? 'report' : 'reports'}</Tag>}
      </div>
      <p className="mt-3 text-[15px] text-ink">{p.advice}</p>
      <p className="mt-2 t-caption">Updated {timeAgo(p.updatedAt)}</p>
    </article>
  );
}
