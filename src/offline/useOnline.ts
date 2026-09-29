// src/offline/useOnline.ts — connectivity state. Includes a "simulate offline" switch for demos on desktop.
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let forcedOffline = false;
try { forcedOffline = sessionStorage.getItem('forceOffline') === '1'; } catch { /* ignore */ }

export function isOnline(): boolean {
  return !forcedOffline && navigator.onLine;
}
export function isForcedOffline(): boolean {
  return forcedOffline;
}
export function setForcedOffline(value: boolean): void {
  forcedOffline = value;
  try { sessionStorage.setItem('forceOffline', value ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
export function subscribeOnline(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, isOnline, () => true);
}
