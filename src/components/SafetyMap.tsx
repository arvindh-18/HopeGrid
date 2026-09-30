// src/components/SafetyMap.tsx — Leaflet + OpenStreetMap map with coloured hazard pins (features.md F19, BR-83).
// Calls onTileError when tiles cannot load so the page can switch to list mode. With a radius (BR-85) it draws that
// circle around the user and zooms to fit it.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import type { PublicIncident } from '../../shared/types';
import { useI18n } from '../i18n';
import { TYPE_ICON } from '../lib/labels';

interface Props {
  incidents: PublicIncident[];
  center: { lat: number; lng: number };
  user?: { lat: number; lng: number } | null;
  radiusM?: number | null;
  selected?: string | null;
  onSelect: (code: string) => void;
  onTileError: () => void;
}

function pinIcon(p: PublicIncident, selected: boolean) {
  return L.divIcon({
    className: '',
    html: `<div class="hazard-pin pin-${p.color}${selected ? ' selected' : ''}">${TYPE_ICON[p.type]}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}
const userIcon = L.divIcon({
  className: '',
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#014adb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(1,74,219,.2)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    map.setView([lat, lng], map.getZoom());
    done.current = true;
  }, [lat, lng, map]);
  return null;
}

// Zooms so the whole circle is visible whenever the user's position or the chosen radius changes.
function FitRadius({ lat, lng, radiusM }: { lat: number; lng: number; radiusM: number }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLng(lat, lng).toBounds(radiusM * 2), { padding: [12, 12] });
  }, [lat, lng, radiusM, map]);
  return null;
}

export function SafetyMap({ incidents, center, user, radiusM, selected, onSelect, onTileError }: Props) {
  const errors = useRef(0);
  const i = useI18n();
  const reported = useRef(false);
  const tileEvents = useMemo(() => ({
    tileerror: () => {
      errors.current += 1;
      if (errors.current >= 3 && !reported.current) {
        reported.current = true;
        onTileError();
      }
    },
  }), [onTileError]);

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={14} scrollWheelZoom className="h-full w-full" attributionControl>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        eventHandlers={tileEvents}
      />
      <Recenter lat={center.lat} lng={center.lng} />
      {user && radiusM && (
        <>
          <Circle center={[user.lat, user.lng]} radius={radiusM} interactive={false}
            pathOptions={{ color: '#014adb', weight: 1.5, dashArray: '6 6', fillColor: '#014adb', fillOpacity: 0.04 }} />
          <FitRadius lat={user.lat} lng={user.lng} radiusM={radiusM} />
        </>
      )}
      {user && <Marker position={[user.lat, user.lng]} icon={userIcon} title={i.t('map.youAreHere')} keyboard={false} />}
      {incidents.map((p) => (
        <Marker
          key={p.code}
          position={[p.lat, p.lng]}
          icon={pinIcon(p, selected === p.code)}
          title={`${i.type(p.type)}${p.area ? `, ${p.area}` : ''}`}
          eventHandlers={{ click: () => onSelect(p.code) }}
        />
      ))}
    </MapContainer>
  );
}
