// S05 Safety map — anonymised hazards with advice; map or list (features.md F19, F20). Only hazards within the chosen
// radius of the phone are shown (BR-85); the filtering happens on the phone, so its location is never sent anywhere.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEMO_CENTER, MAP_DEFAULT_RADIUS_M, MAP_RADIUS_OPTIONS_M, POLL_PUBLIC_MS } from '../../shared/constants';
import { nearbyHazards, withinRadius } from '../../shared/publicView';
import type { PublicIncident } from '../../shared/types';
import { Tag } from '../components/Badges';
import { IconAlert, IconClose, IconList, IconMap } from '../components/Icons';
import { Layout } from '../components/Layout';
import { SafetyMap } from '../components/SafetyMap';
import { EmptyState, ErrorState, FreshnessLine, Notice, Skeleton } from '../components/ui';
import { api } from '../data';
import { usePoll } from '../hooks/usePoll';
import { distanceMeters, formatDistance, getPosition } from '../lib/geo';
import { MARKER_TONE, TYPE_ICON } from '../lib/labels';
import { useI18n } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { useOnline } from '../offline/useOnline';

const LEGEND: PublicIncident['color'][] = ['RED', 'ORANGE', 'YELLOW', 'GREEN'];
const RADIUS_KEY = 'hopegrid.mapRadius';

function savedRadius(): number {
  try {
    const v = Number(localStorage.getItem(RADIUS_KEY));
    if ((MAP_RADIUS_OPTIONS_M as readonly number[]).includes(v)) return v;
  } catch { /* storage blocked: use the default */ }
  return MAP_DEFAULT_RADIUS_M;
}

export default function PublicMap() {
  const { user } = useAuth();
  const online = useOnline();
  const i = useI18n();
  const { t } = i;
  const feed = usePoll(() => api.getPublicIncidents(), POLL_PUBLIC_MS);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locationOff, setLocationOff] = useState(false);
  const [radius, setRadiusState] = useState(savedRadius);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [tilesFailed, setTilesFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getPosition().then((p) => setMe({ lat: p.lat, lng: p.lng })).catch(() => { setMe(null); setLocationOff(true); });
  }, []);

  function setRadius(m: number) {
    setRadiusState(m);
    try { localStorage.setItem(RADIUS_KEY, String(m)); } catch { /* not remembered, still applies */ }
  }
  const km = (m: number) => t('map.km', { n: m / 1000 });

  const mapUnavailable = tilesFailed || !online;
  const effectiveView = mapUnavailable ? 'list' : view;
  const onTileError = useCallback(() => setTilesFailed(true), []);

  const incidents = useMemo(() => {
    const list = feed.data?.incidents ?? [];
    if (!me) return list;
    return [...list].sort((a, b) => distanceMeters(me.lat, me.lng, a.lat, a.lng) - distanceMeters(me.lat, me.lng, b.lat, b.lng));
  }, [feed.data, me]);
  // Without a location every hazard is shown (with a note); with one, only those within the chosen radius.
  const { inside: shown, fartherCount } = useMemo(
    () => (me ? withinRadius(incidents, me.lat, me.lng, radius) : { inside: incidents, fartherCount: 0 }),
    [incidents, me, radius],
  );
  const nearby = me ? nearbyHazards(incidents, me.lat, me.lng) : [];
  const chosen = shown.find((i) => i.code === selected) ?? null;

  return (
    <Layout variant={user?.role === 'ADMIN' ? 'admin' : user?.role === 'VOLUNTEER' ? 'volunteer' : 'public'} width="wide">
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="t-title-lg">{t('map.title')}</h1>
            <p className="mt-1 text-muted">{t('map.lede')}</p>
          </div>
          <div className="flex rounded-full bg-white p-1" role="group" aria-label={t('map.view')}>
            <button type="button" aria-pressed={effectiveView === 'map'} disabled={mapUnavailable} onClick={() => setView('map')}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-[14px] disabled:opacity-40 ${effectiveView === 'map' ? 'bg-ink text-white' : 'text-body'}`}>
              <IconMap size={16} /> {t('map.map')}
            </button>
            <button type="button" aria-pressed={effectiveView === 'list'} onClick={() => setView('list')}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-[14px] ${effectiveView === 'list' ? 'bg-ink text-white' : 'text-body'}`}>
              <IconList size={16} /> {t('map.list')}
            </button>
          </div>
        </header>

        {nearby.length > 0 && (
          <Notice tone="danger">
            <span className="flex items-center gap-2 font-medium"><IconAlert size={18} /> {nearby.length === 1 ? t('map.nearbyOne') : t('map.nearbyMany', { n: nearby.length })}</span>
          </Notice>
        )}
        {me && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('map.radius')}>
            <span className="t-body-sm text-muted">{t('map.radius')}</span>
            {MAP_RADIUS_OPTIONS_M.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={radius === m} onClick={() => setRadius(m)}>{km(m)}</button>
            ))}
            {fartherCount > 0 && (
              <span className="t-caption">{fartherCount === 1 ? t('map.fartherOne', { d: km(radius) }) : t('map.fartherMany', { n: fartherCount, d: km(radius) })}</span>
            )}
          </div>
        )}
        {locationOff && <Notice>{t('map.locationOff')}</Notice>}
        {mapUnavailable && <Notice tone="warning">{online ? t('map.unavailableTiles') : t('map.unavailableOffline')}</Notice>}

        {feed.loading ? (
          <Skeleton className="h-[60vh]" />
        ) : !feed.data ? (
          <ErrorState message={feed.error ? i.server(feed.error.message) : t('map.couldNotLoad')} onRetry={feed.refresh} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            {effectiveView === 'map' && (
              <div className="relative h-[62vh] min-h-[380px] overflow-hidden rounded-[16px] bg-strong">
                <SafetyMap incidents={shown} center={me ?? DEMO_CENTER} user={me} radiusM={me ? radius : null} selected={selected} onSelect={setSelected} onTileError={onTileError} />
                <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-[12px] bg-white/95 px-3 py-2 text-[13px] shadow" aria-label={t('map.legend')}>
                  {LEGEND.map((c) => (
                    <span key={c} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-full pin-${c}`} />{i.legend(c)}</span>
                  ))}
                </div>
                {chosen && (
                  <div className="absolute inset-x-3 bottom-14 z-[600] lg:hidden">
                    <HazardCard p={chosen} me={me} onClose={() => setSelected(null)} />
                  </div>
                )}
              </div>
            )}

            <aside className={`flex flex-col gap-3 ${effectiveView === 'map' ? 'hidden lg:flex' : 'lg:col-span-2'}`} aria-label={t('map.hazardsList')}>
              {chosen && effectiveView === 'map' && <HazardCard p={chosen} me={me} onClose={() => setSelected(null)} />}
              {shown.length === 0 ? (
                <EmptyState title={me ? t('map.emptyWithin', { d: km(radius) }) : t('map.emptyTitle')} body={t('map.emptyBody')} />
              ) : (
                <ul className={`grid gap-2 ${effectiveView === 'list' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'max-h-[56vh] overflow-y-auto'}`}>
                  {shown.map((p) => (
                    <li key={p.code}>
                      <button type="button" onClick={() => setSelected(p.code)}
                        className={`card flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-[#fafafa] ${selected === p.code ? 'ring-2 ring-ink' : ''}`}>
                        <span className={`hazard-pin pin-${p.color} !h-9 !w-9 flex-none`}>{TYPE_ICON[p.type]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{i.type(p.type)}</span>
                          <span className="t-caption block">{p.area ?? t('map.areaUnknown')}{me ? `, ${t('map.away', { d: formatDistance(distanceMeters(me.lat, me.lng, p.lat, p.lng)) })}` : ''}</span>
                          {effectiveView === 'list' && <span className="mt-2 block t-body-sm">{i.advice(p.type, p.status)}</span>}
                        </span>
                        <Tag tone={MARKER_TONE[p.color]}>{i.publicStatus(p.status)}</Tag>
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
  const i = useI18n();
  const { t } = i;
  return (
    <article className="card relative p-5 shadow-[var(--shadow-float)]" aria-live="polite">
      <button type="button" onClick={onClose} aria-label={t('map.close')} className="absolute right-3 top-3 rounded-full p-1.5 text-muted hover:bg-canvas"><IconClose size={18} /></button>
      <div className="flex items-center gap-3 pr-8">
        <span className={`hazard-pin pin-${p.color} flex-none`}>{TYPE_ICON[p.type]}</span>
        <div>
          <h2 className="t-title-sm">{i.type(p.type)}</h2>
          <p className="t-caption">{p.area ?? t('map.areaUnknown')}{me ? `, ${t('map.away', { d: formatDistance(distanceMeters(me.lat, me.lng, p.lat, p.lng)) })}` : ''}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Tag tone={MARKER_TONE[p.color]} dot>{i.publicStatus(p.status)}</Tag>
        <Tag tone="neutral">{t('map.priority', { p: i.priority(p.priority) })}</Tag>
        {p.verified ? <Tag tone="ok">{t('map.verified')}</Tag> : <Tag tone="medium">{p.reportCount === 1 ? t('map.unverifiedOne') : t('map.unverifiedMany', { n: p.reportCount })}</Tag>}
      </div>
      <p className="mt-3 text-[15px] text-ink">{i.advice(p.type, p.status)}</p>
      <p className="mt-2 t-caption">{t('map.updated', { ago: i.ago(p.updatedAt) })}</p>
    </article>
  );
}
