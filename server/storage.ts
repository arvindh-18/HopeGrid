// server/storage.ts — private "media" bucket (architecture D7, §6.7). Media reaches users only via signed URLs (AR-24).
import { SIGNED_URL_SECONDS } from '../shared/constants';
import { db } from './supabase';

const BUCKET = 'media';
const bucket = () => db.storage.from(BUCKET);

/** Upload base64 media (no data-URL prefix). Overwrites, so a retried upload is harmless. */
export async function uploadBase64(path: string, base64: string, mime: string): Promise<void> {
  const { error } = await bucket().upload(path, Buffer.from(base64, 'base64'), { contentType: mime, upsert: true });
  if (error) throw new Error(`Storage upload failed for ${path}: ${error.message}`);
}

export async function downloadBuffer(path: string): Promise<Buffer> {
  const { data, error } = await bucket().download(path);
  if (error || !data) throw new Error(`Storage download failed for ${path}: ${error?.message ?? 'no data'}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Signed URL valid for SIGNED_URL_SECONDS (1 hour), or null when there is no media. */
export async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw new Error(`Could not sign ${path}: ${error.message}`);
  return data.signedUrl;
}

/** Signed URLs for many paths in one call → Map(path → url). */
export async function signedUrls(paths: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data, error } = await bucket().createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error) throw new Error(`Could not sign media: ${error.message}`);
  for (const d of data) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

/** Delete the given objects (missing ones are ignored). Used by the retention clean-up. */
export async function removeFiles(paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await bucket().remove(unique.slice(i, i + 100));
    if (error) throw new Error(`Could not delete media: ${error.message}`);
  }
}

/** Delete every object under a folder (used by the seed script). */
export async function removeFolder(folder: string): Promise<void> {
  const { data, error } = await bucket().list(folder, { limit: 1000 });
  if (error) throw new Error(`Could not list ${folder}: ${error.message}`);
  const files: string[] = [];
  for (const item of data) {
    const path = `${folder}/${item.name}`;
    if (item.id === null) await removeFolder(path); // sub-folder
    else files.push(path);
  }
  if (files.length) {
    const { error: rmError } = await bucket().remove(files);
    if (rmError) throw new Error(`Could not delete files in ${folder}: ${rmError.message}`);
  }
}
