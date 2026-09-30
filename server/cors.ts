// server/cors.ts — lets the HopeGrid Android app (Capacitor) call the API. Its pages are served from the phone itself
// (origin https://localhost; capacitor://localhost on iOS), so the browser treats every /api call as cross-site.
// Only these app origins are allowed; the website is same-site and needs nothing. Staff auth is a bearer token, not a
// cookie, so allowing an origin never hands it anyone's session.
import type { NextFunction, Request, Response } from 'express';

export const APP_ORIGINS: ReadonlySet<string> = new Set(['https://localhost', 'capacitor://localhost']);

export function appCors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && APP_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, ngrok-skip-browser-warning');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
  }
  next();
}
