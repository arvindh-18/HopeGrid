// src/lib/geo.ts — device location helpers.
export { distanceMeters, formatDistance } from '../../shared/linking';

export interface Position { lat: number; lng: number; accuracy: number }

export function getPosition(timeoutMs = 10_000): Promise<Position> {
  if (override) return Promise.resolve(override);
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location is not supported on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location permission was denied.' : 'Location is not available right now.')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

// ---------- Demo location override (mock mode) ----------
// In mock mode the device "stands" at the demo centre so seeded incidents, duplicates and related incidents line up.
// The Demo menu can switch back to the real GPS position.
let override: Position | null = null;
export function setPositionOverride(pos: Position | null): void {
  override = pos;
}
export function getPositionOverride(): Position | null {
  return override;
}
