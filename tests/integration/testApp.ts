// tests/integration/testApp.ts — the real routers wired exactly like server/index.ts (same order, same JSON limit,
// same error envelope), listening on a random local port. server/index.ts can't be imported in tests because it
// starts listening, loads the models and reprocesses reports on import. Keep this file in sync with it.
import express, { type ErrorRequestHandler } from 'express';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { adminRouter } from '../../server/routes/admin';
import { applicationsRouter } from '../../server/routes/applications';
import { authRouter } from '../../server/routes/authRoutes';
import { devRouter } from '../../server/routes/dev';
import { messagesRouter } from '../../server/routes/messages';
import { publicRouter } from '../../server/routes/public';
import { smsRouter } from '../../server/routes/sms';
import { appCors } from '../../server/cors';
import { victimRouter } from '../../server/routes/victim';
import { volunteerRouter } from '../../server/routes/volunteer';
import { ApiError, type ErrorCode } from '../../shared/types';

// Copied from server/index.ts.
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
  NETWORK: 503,
};

export interface TestStream {
  status: number;
  contentType: string;
  /** Parsed `data` of every `change` event received so far. */
  events: unknown[];
  raw: () => string;
  /** Resolves once at least `n` change events have arrived. */
  waitFor: (n: number, timeoutMs?: number) => Promise<unknown[]>;
  close: () => void;
}

export interface TestServer {
  call: <T = any>(method: string, path: string, body?: unknown, opts?: { token?: string; headers?: Record<string, string> }) => Promise<{ status: number; body: T; raw: string; headers: import('node:http').IncomingHttpHeaders }>;
  /** Opens a Server-Sent Events request and resolves once the response headers arrive. */
  stream: (method: string, path: string, body?: unknown, opts?: { token?: string }) => Promise<TestStream>;
  close: () => Promise<void>;
  errors: unknown[];
}

export async function startTestServer({ devMode = false } = {}): Promise<TestServer> {
  const errors: unknown[] = [];
  const app = express();
  app.use('/api', appCors);
  app.use('/api/sms', smsRouter);
  app.use(express.json({ limit: '15mb' }));
  app.use('/api', victimRouter);
  app.use('/api', messagesRouter);
  app.use('/api', publicRouter);
  app.use('/api', authRouter);
  app.use('/api', applicationsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/volunteer', volunteerRouter);
  if (devMode) app.use('/api', devRouter);
  app.use('/api', (_req, _res, next) => next(new ApiError('NOT_FOUND', 'Unknown API route.')));
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    let apiError: ApiError;
    if (err instanceof ApiError) apiError = err;
    else if (err?.type === 'entity.parse.failed') apiError = new ApiError('VALIDATION', 'Request body is not valid JSON.');
    else if (err?.type === 'entity.too.large') apiError = new ApiError('VALIDATION', 'Request is too large.');
    else {
      errors.push(err); // unexpected server errors are collected so tests can assert there were none
      apiError = new ApiError('SERVER_ERROR', 'Something went wrong on the server. Please try again.');
    }
    res.status(HTTP_STATUS[apiError.code]).json({ error: { code: apiError.code, message: apiError.message } });
  };
  app.use(errorHandler);

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;

  const call: TestServer['call'] = (method, path, body, opts = {}) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const headers: Record<string, string> = { host: `localhost:${port}`, ...opts.headers };
      if (payload !== undefined) headers['content-type'] = 'application/json';
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;
      const req = httpRequest({ host: '127.0.0.1', port, method, path: `/api${path}`, headers }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null, raw, headers: res.headers }));
      });
      req.on('error', reject);
      if (payload !== undefined) req.write(payload);
      req.end();
    });

  const stream: TestServer['stream'] = (method, path, body, opts = {}) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const headers: Record<string, string> = { host: `localhost:${port}`, accept: 'text/event-stream' };
      if (payload !== undefined) headers['content-type'] = 'application/json';
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;
      const req = httpRequest({ host: '127.0.0.1', port, method, path: `/api${path}`, headers }, (res) => {
        let raw = '';
        let buffer = '';
        const events: unknown[] = [];
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          raw += chunk;
          buffer += chunk;
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const lines = buffer.slice(0, end).split('\n');
            buffer = buffer.slice(end + 2);
            const data = lines.find((l) => l.startsWith('data: '));
            if (lines.includes('event: change')) events.push(data ? JSON.parse(data.slice(6)) : null);
          }
        });
        res.on('error', () => {});
        resolve({
          status: res.statusCode ?? 0,
          contentType: String(res.headers['content-type'] ?? ''),
          events,
          raw: () => raw,
          waitFor: (n, timeoutMs = 2000) =>
            new Promise((ok, fail) => {
              const started = Date.now();
              const check = () => {
                if (events.length >= n) ok(events);
                else if (Date.now() - started > timeoutMs) fail(new Error(`expected ${n} events, got ${events.length}: ${raw}`));
                else setTimeout(check, 10);
              };
              check();
            }),
          close: () => req.destroy(),
        });
      });
      req.on('error', (e) => { if ((e as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(e); });
      if (payload !== undefined) req.write(payload);
      req.end();
    });

  return {
    call,
    stream,
    errors,
    close: () => new Promise((resolve) => {
      server.closeAllConnections(); // open event streams would otherwise keep the server alive
      server.close(() => resolve());
    }),
  };
}
