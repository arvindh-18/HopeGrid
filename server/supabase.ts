import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env (see .env.example)`);
  return value;
}

const url = requireEnv('SUPABASE_URL');

// Venue and hotspot networks drop connections now and then. Retry requests that never got an HTTP response
// (network errors only — real error responses are returned as-is) so one blip doesn't fail a report half-way.
const RETRY_DELAYS_MS = [300, 1000, 2500];
const retryingFetch: typeof fetch = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      if (attempt >= RETRY_DELAYS_MS.length || init?.signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
};

const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: retryingFetch } };

// Service role: all data + storage access. Server-only — never expose to the frontend.
export const db = createClient(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), options);

// Anon key: used only for staff sign-in (signInWithPassword).
export const authClient = createClient(url, requireEnv('SUPABASE_ANON_KEY'), options);
