// Market-value refresh for owned comics: one raw-copy estimate per owned
// cover (main or variant), summed and stored on the entry as `est`.
import { useSyncExternalStore } from 'react';
import { priceFor } from '../api/prices';
import { collection } from './collection';
import type { Entry } from '../types';

type Progress = { done: number; total: number } | null;
let progress: Progress = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function estimateFor(e: Entry): Promise<number | null> {
  const copies = e.variants.length ? e.variants : [null];
  let sum = 0;
  let any = false;
  for (const v of copies) {
    const isMain = !v || v.id === e.comicId;
    const p = await priceFor(e.meta, isMain ? null : v.name).catch(() => null);
    const each = p?.raw ?? (isMain ? null : (await priceFor(e.meta).catch(() => null))?.raw ?? null);
    if (each != null) {
      sum += each;
      any = true;
    } else if (e.meta.price != null) {
      sum += e.meta.price; // unknown copy: count it at cover price
    }
  }
  return any ? Math.round(sum * 100) / 100 : null;
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
      const e = todo[i++];
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

export function useValueRefresh(): Progress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => progress,
  );
}
