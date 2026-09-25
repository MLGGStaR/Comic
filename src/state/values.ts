// Market-value refresh for owned comics: asks the API for a raw-copy
// estimate per comic (and per owned variant) and stores it on the entry.
import { useSyncExternalStore } from 'react';
import { api } from '../api/client';
import { collection } from './collection';
import type { Entry } from '../types';

type Progress = { done: number; total: number } | null;
let progress: Progress = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function estimateFor(e: Entry): Promise<number | null> {
  const ids = e.variants.length ? e.variants.map((v) => v.id) : [null];
  let sum = 0;
  let any = false;
  for (const vid of ids) {
    const p = await api.price(e.comicId, vid && vid !== e.comicId ? vid : undefined).catch(() => null);
    if (p?.raw != null) {
      sum += p.raw;
      any = true;
    } else if (e.meta.price != null) {
      sum += e.meta.price; // unknown variant price: count it at cover
    }
  }
  return any ? Math.round(sum * 100) / 100 : null;
}

export async function refreshValues(entries: Entry[], opts?: { force?: boolean }) {
  if (progress) return;
  // prices are cached for a day on both ends, so a forced refresh is cheap to repeat
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
    await Promise.all([worker(), worker(), worker()]);
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
