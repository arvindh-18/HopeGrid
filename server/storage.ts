// server/storage.ts — private "media" bucket (architecture D7, §6.7).
import { db } from './supabase';

const BUCKET = 'media';

/** Upload base64 media (no data-URL prefix). Overwrites, so a retried report upload is harmless. */
export async function uploadBase64(path: string, base64: string, mime: string): Promise<void> {
  const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(base64, 'base64'), {
    contentType: mime,
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed for ${path}: ${error.message}`);
}
