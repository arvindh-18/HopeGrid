// src/offline/deviceId.ts — anonymous device identifier (rules.md BR-01). Never changes on this device.
import { get, set } from 'idb-keyval';
import { newUuid } from '../lib/codes';

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const existing = await get<string>('deviceId');
  if (existing) return (cached = existing);
  const id = newUuid();
  await set('deviceId', id);
  return (cached = id);
}
