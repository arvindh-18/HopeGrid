// server/events.ts — live change signals for staff and victim screens (Server-Sent Events, architecture D12).
// A signal only says WHICH incident changed; screens then refetch through their normal, authorised API calls, so no
// report data travels on a stream. Signals for the same incident are merged per STREAM_COALESCE_MS window.
// In-process only: with more than one server instance, signals would have to go through Postgres LISTEN/NOTIFY.
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { STREAM_COALESCE_MS, STREAM_PING_MS } from '../shared/constants';

export interface Change {
  incidentId: string;
  /** Set when a report was linked to the incident, finished processing, or got a chat message. */
  reportId?: string;
  /** Set when a volunteer was assigned to the incident. */
  volunteerId?: string;
}

const bus = new EventEmitter().setMaxListeners(0);
let pending = new Map<string, Change>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Announce a change. Changes to the same incident within STREAM_COALESCE_MS go out as one signal. */
export function emitChange(c: Change): void {
  pending.set(`${c.incidentId}|${c.reportId ?? ''}|${c.volunteerId ?? ''}`, c);
  flushTimer ??= setTimeout(() => {
    const batch = [...pending.values()];
    pending = new Map();
    flushTimer = null;
    for (const change of batch) bus.emit('change', change);
  }, STREAM_COALESCE_MS);
}

/** Open streams (for tests and monitoring). */
export const openStreamCount = () => bus.listenerCount('change');

/**
 * Turn `res` into a Server-Sent Events stream. For each change, `pick` returns the JSON payload of a `change` event,
 * or null to skip it. The stream stays open until the client disconnects.
 */
export function openStream(res: Response, pick: (c: Change) => Promise<object | null> | object | null): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // ask proxies not to hold the stream back
  });
  // The client counts a stream as live only once bytes arrive, so a proxy that buffers it leaves the screen polling.
  res.write(': connected\n\n');
  const ping = setInterval(() => res.write(': ping\n\n'), STREAM_PING_MS);
  const onChange = (c: Change) => {
    Promise.resolve(pick(c))
      .then((payload) => {
        if (payload && !res.writableEnded) res.write(`event: change\ndata: ${JSON.stringify(payload)}\n\n`);
      })
      .catch(() => { /* a failed lookup only skips this signal; the screen's fallback polling catches up */ });
  };
  bus.on('change', onChange);
  // res 'close' (not req 'close', which fires once a POST body has been read) = the client went away.
  res.on('close', () => {
    clearInterval(ping);
    bus.off('change', onChange);
  });
}
