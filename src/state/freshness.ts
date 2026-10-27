// Keeps the stored snapshots of your comics current: delays (new release
// dates), final cover art replacing placeholders, price or title changes.
// Upcoming and recent comics are re-checked twice a day, older ones monthly;
// only real changes are written.
import { api } from '../api/client';
import { idbGet, idbSet } from '../lib/idb';
import { dueForCheck, refreshedMeta } from '../lib/snapshot';
import { collection } from './collection';
import type { Entry } from '../types';

const KEY = 'meta-checked';
let running: Promise<void> | null = null;

export function refreshSnapshots(entries: Entry[], max = 60): Promise<void> {
  running ??= (async () => {
    const checked = new Map((await idbGet<[string, number][]>(KEY)) ?? []);
    const now = Date.now();
    const due = entries
      .filter((e) => dueForCheck(e.meta, checked.get(e.comicId) ?? 0, now))
      // the soonest-changing first: undated, then newest release dates
      .sort((a, b) => (b.meta.releaseDate ?? '9999').localeCompare(a.meta.releaseDate ?? '9999'))
      .slice(0, max);
    let i = 0;
    const worker = async () => {
      while (i < due.length) {
        const e = due[i++];
        try {
          const d = await api.comicNow(e.meta);
          const cur = collection.entry(e.comicId);
          const next = cur ? refreshedMeta(cur.meta, d) : null;
          if (next) await collection.patch(next, {});
          checked.set(e.comicId, Date.now());
        } catch {
          // offline / source hiccup: try again next time
        }
      }
    };
    await Promise.all([worker(), worker()]);
    await idbSet(KEY, [...checked.entries()]);
  })().finally(() => {
    running = null;
  });
  return running;
}
