// Genre tags per series (the data sources have none): asked for once per
// series via the comic-api `genres` op (Claude, cached forever server-side)
// and kept in IndexedDB here.
import { useEffect, useSyncExternalStore } from 'react';
import { SUPABASE_ANON, SUPABASE_URL, supabase } from '../supabase';
import { idbGet, idbSet } from '../lib/idb';
import type { ComicLite, Entry } from '../types';
import { seriesKey } from './mySeries';

let tags = new Map<string, string[]>();
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const inflight = new Set<string>();

export function genreKey(c: ComicLite): string {
  return c.seriesId ?? `t:${seriesKey(c.series ?? c.title)}`;
}

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const cached = await idbGet<[string, string[]][]>('genres');
  if (cached?.length) {
    tags = new Map([...cached, ...tags]);
    emit();
  }
}

async function fetchMissing(list: ComicLite[]) {
  await ensureLoaded();
  const want = new Map<string, { key: string; title: string; publisher: string | null }>();
  for (const c of list) {
    const key = genreKey(c);
    if (tags.has(key) || inflight.has(key) || want.has(key)) continue;
    want.set(key, { key, title: c.series ?? c.title, publisher: c.publisher });
  }
  if (!want.size) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  for (const k of want.keys()) inflight.add(k);
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/comic-api?op=genres`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ series: [...want.values()] }),
    });
    if (!r.ok) return;
    const got = (await r.json()) as Record<string, string[]>;
    const next = new Map(tags);
    for (const [k, g] of Object.entries(got)) next.set(k, g);
    tags = next;
    emit();
    void idbSet('genres', [...tags.entries()]);
  } catch {
    // try again next time
  } finally {
    for (const k of want.keys()) inflight.delete(k);
  }
}

/** Genre map for these entries (fetches any unknown series in the background). */
export function useGenres(entries: Entry[]): Map<string, string[]> {
  const map = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => tags,
  );
  useEffect(() => {
    if (entries.length) void fetchMissing(entries.map((e) => e.meta));
    else void ensureLoaded();
  }, [entries]);
  return map;
}

export const genresOf = (map: Map<string, string[]>) => (e: Entry) => map.get(genreKey(e.meta)) ?? [];
