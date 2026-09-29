// server/index.ts — Express app (architecture §5.1): JSON API under /api, error envelope (§8.1),
// serves the built frontend (dist/) with SPA fallback.
import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, type ErrorCode } from '../shared/types';
import { loadAiModel } from './ai';
import { processPendingReports } from './pipeline';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/authRoutes';
import { devRouter } from './routes/dev';
import { messagesRouter } from './routes/messages';
import { publicRouter } from './routes/public';
import { victimRouter } from './routes/victim';
import { volunteerRouter } from './routes/volunteer';
import { loadWhisper } from './transcribe';

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CODE_TAKEN: 409,
  INVALID_STATE: 409,
  CHAT_CLOSED: 409,
  INSUFFICIENT_QUANTITY: 409,
  SERVER_ERROR: 500,
  NETWORK: 503, // client-only code; never expected here
};

const app = express();
app.use(express.json({ limit: '15mb' }));

app.use('/api', victimRouter);
app.use('/api', messagesRouter); // victim chat + volunteer chat, before the volunteer router
app.use('/api', publicRouter);
app.use('/api', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/volunteer', volunteerRouter);
if (process.env.DEV_MODE === 'true') app.use('/api', devRouter);
app.use('/api', (_req, _res, next) => next(new ApiError('NOT_FOUND', 'Unknown API route.')));

// Built frontend (demo mode: `npm run build && npm start`).
const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(resolve(dist, 'index.html'));
  });
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let apiError: ApiError;
  if (err instanceof ApiError) {
    apiError = err;
  } else if (err?.type === 'entity.parse.failed') {
    apiError = new ApiError('VALIDATION', 'Request body is not valid JSON.');
  } else if (err?.type === 'entity.too.large') {
    apiError = new ApiError('VALIDATION', 'Request is too large.');
  } else {
    console.error(err);
    apiError = new ApiError('SERVER_ERROR', 'Something went wrong on the server. Please try again.');
  }
  res.status(HTTP_STATUS[apiError.code]).json({ error: { code: apiError.code, message: apiError.message } });
};
app.use(errorHandler);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`HopeGrid server on http://localhost:${port}${process.env.DEV_MODE === 'true' ? ' (DEV_MODE)' : ''}`);
  // Load the local AI and speech models once (if `npm run setup-ai` installed them), then process every report
  // still PENDING (D9: nothing is lost on restart). Without a model each report falls back (BR-11, BR-12).
  const warm = (name: string, load: () => Promise<unknown>) => load().then(
    () => console.log(`${name} ready`),
    (e) => console.warn(`${name} unavailable: ${e instanceof Error ? e.message : e}`),
  );
  Promise.all([warm('AI model', loadAiModel), warm('Speech model', loadWhisper)])
    .then(processPendingReports)
    .catch((e) => console.error('Processing pending reports failed:', e));
});
