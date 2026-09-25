// Market-value refresh for owned comics: one raw-copy estimate per owned
// cover (main or variant), summed and stored on the entry as `est`.
import { useSyncExternalStore } from 'react';
import { api } from '../api/client';
import { priceFor } from '../api/prices';
import { collection } from './collection';
import { estimateCopies } from '../lib/shelf';
import type { ComicDetail, Entry } from '../types';

type Progress = { done: number; total: number } | null;
let progress: Progress = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const estimateFor = (e: Entry) => estimateCopies(e, priceFor);

/** A comic with only one cover can't be "which cover?" — pick it for you. */
export async function autoPickOnlyCover(e: Entry, known?: ComicDetail | null): Promise<Entry> {
  if (!e.owned || e.variants.length) return e;
  const d = known ?? (await api.comic(e.meta).catch(() => null));
  if (!d || d.variants.length) return e;
  await collection.patch(e.meta, { variants: [{ id: e.comicId, name: 'Main cover', cover: d.cover ?? e.meta.cover, price: d.price ?? e.meta.price }] });
  return collection.entry(e.comicId) ?? e;
}

export async function refreshValues(entries: Entry[], opts?: { force?: boolean }) {
  if (progress) return;
  // prices are cached for a day on-device, so a forced refresh is cheap to repeat
  const todo = entries.filter((e) => e.owned && (opts?.force || e.est == null));
  progress = { done: 0, total: todo.length };
  emit();
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const orig = todo[i++];
      const e = await autoPickOnlyCover(orig).catch(() => orig);
      try {
        const est = await estimateFor(e);
        const cur = collection.entry(e.comicId);
        if (cur && est !== cur.est) await collection.patch(cur.meta, { est });
      } catch {
        // skip this one
      }
      progress = { done: (progress?.done ?? 0) + 1, total: todo.length };
      emit();
    }
  };
  try {
    await Promise.all([worker(), worker()]);
  } finally {
    progress = null;
    emit();
  }
}

// Values stored under older rules (every copy the 1st print; a listing from a
// decades-older volume; no grades): once per device, recompute everything.
const VALUES_VERSION = '3';
let migrating: Promise<void> | null = null;
export function migrateValues(entries: Entry[]): Promise<void> {
  migrating ??= (async () => {
    try {
      if (localStorage.getItem('lbx-values-v') === VALUES_VERSION) return;
    } catch {
      return;
    }
    const owned = entries.filter((e) => e.owned);
    if (owned.length) await refreshValues(owned, { force: true });
    try {
      localStorage.setItem('lbx-values-v', VALUES_VERSION);
    } catch {
      // retried next launch
    }
  })();
  return migrating;
}

export function useValueRefresh(): Progress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => progress,
  );
}
