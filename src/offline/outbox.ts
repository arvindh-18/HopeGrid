// src/offline/outbox.ts — offline queue for reports (rules.md BR-02). Real code in every mode:
// only the final api.submitReport() call differs between mock and real.
import { get, set } from 'idb-keyval';
import { useEffect, useState } from 'react';
import { OUTBOX_RETRY_MS } from '../../shared/constants';
import { ApiError, type ReportSubmission } from '../../shared/types';
import { api } from '../data';
import { newReportCode } from '../lib/codes';
import { isOnline, subscribeOnline } from './useOnline';

export type OutboxStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
export interface OutboxItem {
  id: string;
  submission: ReportSubmission;
  status: OutboxStatus;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

const KEY = 'outbox';
const listeners = new Set<(items: OutboxItem[]) => void>();
let items: OutboxItem[] = [];
let loaded = false;
let syncing = false;
let timer: ReturnType<typeof setInterval> | null = null;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  items = (await get<OutboxItem[]>(KEY)) ?? [];
  // A crash mid-send leaves SENDING items; they go back to the queue.
  items = items.map((i) => (i.status === 'SENDING' ? { ...i, status: 'QUEUED' } : i));
  loaded = true;
}
async function persist(): Promise<void> {
  await set(KEY, items);
  const snapshot = [...items];
  listeners.forEach((l) => l(snapshot));
}
function update(id: string, patch: Partial<OutboxItem>): void {
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

export async function list(): Promise<OutboxItem[]> {
  await ensureLoaded();
  return [...items];
}
export async function getItem(id: string): Promise<OutboxItem | undefined> {
  await ensureLoaded();
  return items.find((i) => i.id === id);
}
export function subscribe(fn: (items: OutboxItem[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Always called on submit — online or offline (features.md F01). */
export async function enqueue(submission: ReportSubmission): Promise<OutboxItem> {
  await ensureLoaded();
  const item: OutboxItem = { id: submission.id, submission, status: 'QUEUED', error: null, createdAt: submission.createdAt, sentAt: null };
  items = [...items, item];
  await persist();
  void syncNow();
  return item;
}

export async function remove(id: string): Promise<void> {
  await ensureLoaded();
  items = items.filter((i) => i.id !== id);
  await persist();
}

export async function retryAll(): Promise<void> {
  await ensureLoaded();
  items = items.map((i) => (i.status === 'FAILED' && i.error?.startsWith('Could not get a free code') ? { ...i, status: 'QUEUED' } : i));
  await syncNow();
}

async function sendOne(item: OutboxItem): Promise<void> {
  let submission = item.submission;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await api.submitReport(submission);
      update(item.id, { status: 'SENT', sentAt: new Date().toISOString(), error: null, submission: { ...submission, code: res.code } });
      return;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('NETWORK', 'Network error');
      if (err.code === 'CODE_TAKEN' && attempt < 3) {
        submission = { ...submission, code: newReportCode() };
        update(item.id, { submission });
        continue;
      }
      if (err.code === 'CODE_TAKEN') {
        update(item.id, { status: 'FAILED', error: 'Could not get a free code. Tap retry.' });
      } else if (err.code === 'VALIDATION') {
        update(item.id, { status: 'FAILED', error: err.message });
      } else {
        update(item.id, { status: 'QUEUED', error: null }); // network / server error → try later
      }
      return;
    }
  }
}

/** One sync pass: oldest first, one at a time, only one pass at a time. */
export async function syncNow(): Promise<void> {
  await ensureLoaded();
  if (syncing || !isOnline()) return;
  syncing = true;
  try {
    for (const item of [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (item.status !== 'QUEUED') continue;
      if (!isOnline()) break;
      update(item.id, { status: 'SENDING' });
      await persist();
      await sendOne(item);
      await persist();
    }
  } finally {
    syncing = false;
  }
}

/** Triggers: app start, online event, every OUTBOX_RETRY_MS while queued items exist, "Retry now". */
export function start(): void {
  void syncNow();
  subscribeOnline(() => { if (isOnline()) void syncNow(); });
  if (!timer) {
    timer = setInterval(() => {
      if (items.some((i) => i.status === 'QUEUED')) void syncNow();
    }, OUTBOX_RETRY_MS);
  }
}

/** React hook: live outbox items (null while loading). */
export function useOutbox(): OutboxItem[] | null {
  const [state, setState] = useState<OutboxItem[] | null>(loaded ? [...items] : null);
  useEffect(() => {
    let alive = true;
    void list().then((xs) => { if (alive) setState(xs); });
    const off = subscribe((xs) => setState(xs));
    return () => { alive = false; off(); };
  }, []);
  return state;
}
