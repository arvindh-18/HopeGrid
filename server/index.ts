// server/index.ts — Express app (architecture §5.1): JSON API under /api, error envelope (§8.1),
// serves the built frontend (dist/) with SPA fallback.
import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, type ErrorCode } from '../shared/types';
import { victimRouter } from './routes/victim';

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
app.listen(port, () => console.log(`HopeGrid server on http://localhost:${port}`));
