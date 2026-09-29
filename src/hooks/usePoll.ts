// src/hooks/usePoll.ts — fetch + refresh every N ms (architecture D12: polling, no websockets).
import { useCallback, useEffect, useRef, useState } from 'react';
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

export function usePoll<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[] = [], enabled = true): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const alive = useRef(true);

  const refresh = useCallback(async () => {
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
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(t);
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
