// server/auth.ts — staff authentication (architecture D8). Verifies the Supabase bearer token on every request.
import type { NextFunction, Request, Response } from 'express';
import { ApiError, type ProfileRecord, type Role, type SessionUser } from '../shared/types';
import { fromRow } from './mappers';
import { db } from './supabase';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: SessionUser }
  }
}

export async function loadProfile(id: string): Promise<ProfileRecord | null> {
  const { data, error } = await db.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  return data ? fromRow<ProfileRecord>(data) : null;
}

export const toSessionUser = (p: ProfileRecord): SessionUser => ({ id: p.id, name: p.name, role: p.role });

/** Middleware: `Authorization: Bearer <token>` → req.user; 401 if missing/invalid, 403 if the role is wrong. */
export function requireRole(role?: Role) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new ApiError('UNAUTHORIZED', 'Please log in.');
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new ApiError('UNAUTHORIZED', 'Your session has ended. Log in again.');
    const profile = await loadProfile(data.user.id);
    if (!profile) throw new ApiError('UNAUTHORIZED', 'This account has no staff profile.');
    if (role && profile.role !== role) throw new ApiError('FORBIDDEN', 'You do not have access to this.');
    req.user = toSessionUser(profile);
    next();
  };
}

/** req.user after requireRole. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new ApiError('UNAUTHORIZED', 'Please log in.');
  return req.user;
}
