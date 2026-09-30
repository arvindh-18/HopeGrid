// src/hooks/usePoll.ts — fetch + refresh every N ms (architecture D12). With an optional live change signal
// (`watch`, Server-Sent Events): refresh when a signal arrives, but never more often than every `intervalMs`, and
// while the signal stream is connected fall back to polling only every POLL_FALLBACK_MS.
import { useCallback, useEffect, useRef, useState } from 'react';
import { POLL_FALLBACK_MS } from '../../shared/constants';
import { ApiError } from '../../shared/types';

export interface PollState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** True when the latest refresh failed but older data is still shown. */
  stale: boolean;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  setData: (d: T) => void;
}

/** Subscribe to change signals; returns an unsubscribe function (see Api.watchAdmin/watchVolunteer/watchTrack). */
export type Watch = (onChange: () => void, onLive: (live: boolean) => void) => () => void;

export function usePoll<T>(
  fn: () => Promise<T>, intervalMs: number, deps: unknown[] = [], enabled = true, watch?: Watch,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const watchRef = useRef(watch);
  watchRef.current = watch;
  const alive = useRef(true);
  const live = useRef(false); // a change stream is connected
  const dirty = useRef(false); // a change was signalled since the last refresh
  const lastRefresh = useRef(0);

  const refresh = useCallback(async () => {
    lastRefresh.current = Date.now();
    dirty.current = false;
    try {
      const d = await fnRef.current();
      if (!alive.current) return;
      setData(d);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof ApiError ? e : new ApiError('SERVER_ERROR', 'Something went wrong.'));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return;
    setLoading(true);
    void refresh();
    const visible = () => document.visibilityState === 'visible';
    const t = setInterval(() => {
      if (!visible()) return;
      // Without a live stream: poll every tick. With one: only when a change was signalled, or as a slow fallback.
      if (!live.current || dirty.current || Date.now() - lastRefresh.current >= POLL_FALLBACK_MS) void refresh();
    }, intervalMs);
    const unwatch = watchRef.current?.(
      () => {
        dirty.current = true;
        // Refresh at once after a quiet spell; otherwise the next tick (≤ intervalMs away) picks it up.
        if (visible() && Date.now() - lastRefresh.current >= intervalMs) void refresh();
      },
      (isLive) => { live.current = isLive; },
    );
    return () => {
      alive.current = false;
      clearInterval(t);
      unwatch?.();
      live.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, enabled, ...deps]);

  const set = useCallback((d: T) => {
    setData(d);
    setLastUpdated(new Date());
    setError(null);
  }, []);

  return { data, error, loading: loading && data === null, stale: !!error && data !== null, lastUpdated, refresh, setData: set };
}
