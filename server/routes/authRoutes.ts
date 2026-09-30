// server/routes/authRoutes.ts — staff login (F11). Supabase Auth is called by the server (architecture D8).
import { Router } from 'express';
import { ApiError } from '../../shared/types';
import { currentUser, loadProfile, requireRole, toSessionUser } from '../auth';
import { authClient, db } from '../supabase';

export const authRouter = Router();

// POST /api/auth/login {email, password} → {token, user}
authRouter.post('/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    throw new ApiError('VALIDATION', 'Enter your email and password.');
  }
  const { data, error } = await authClient.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.session) throw new ApiError('UNAUTHORIZED', 'Email or password is incorrect.');
  const profile = await loadProfile(data.user.id);
  if (!profile) {
    // A volunteer who registered (F26) has a login but no profile until a coordinator approves them.
    const { data: app } = await db.from('volunteer_applications').select('status').eq('user_id', data.user.id).eq('status', 'PENDING').maybeSingle();
    if (app) throw new ApiError('UNAUTHORIZED', 'Your volunteer application is waiting for a coordinator to approve it.');
    throw new ApiError('UNAUTHORIZED', 'This account has no staff profile.');
  }
  res.json({ token: data.session.access_token, user: toSessionUser(profile) });
});

// GET /api/auth/me → {user}
authRouter.get('/auth/me', requireRole(), (req, res) => {
  res.json({ user: currentUser(req) });
});
