import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env (see .env.example)`);
  return value;
}

const url = requireEnv('SUPABASE_URL');
const options = { auth: { persistSession: false, autoRefreshToken: false } };

// Service role: all data + storage access. Server-only — never expose to the frontend.
export const db = createClient(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), options);

// Anon key: used only for staff sign-in (signInWithPassword).
export const authClient = createClient(url, requireEnv('SUPABASE_ANON_KEY'), options);
