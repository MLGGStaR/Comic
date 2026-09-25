// How many issues each collected edition holds (the data sources don't say):
// asked for once per edition via the comic-api `collects` op (Claude, cached
// forever server-side, unknowns too) and kept in IndexedDB here. Your own
// count, set on the comic's page, lives on your entry and always wins.
import { useEffect, useSyncExternalStore } from 'react';
import { SUPABASE_ANON, SUPABASE_URL, supabase } from '../supabase';
import { idbGet, idbSet } from '../lib/idb';
import type { Collects } from '../lib/shelf';
import type { ComicLite, Entry } from '../types';

let known = new Map<string, Collects>();
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const inflight = new Set<string>();

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const cached = await idbGet<[string, Collects][]>('collects');
  if (cached?.length) {
    known = new Map([...cached, ...known]);
    emit();
  }
}

async function fetchMissing(list: ComicLite[]) {
  await ensureLoaded();
  const want = list.filter((c) => c.format === 'collection' && !known.has(c.id) && !inflight.has(c.id));
  if (!want.length) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  for (const c of want) inflight.add(c.id);
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/comic-api?op=collects`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: want.map((c) => ({ key: c.id, title: c.title, publisher: c.publisher, date: c.releaseDate })) }),
    });
    if (!r.ok) return;
    const got = (await r.json()) as Record<string, Collects>;
    const next = new Map(known);
    for (const [k, v] of Object.entries(got)) next.set(k, v);
    known = next;
    emit();
    void idbSet('collects', [...known.entries()]);
  } catch {
    // try again next time
  } finally {
    for (const c of want) inflight.delete(c.id);
  }
}

/** What these entries' collected editions hold (unknown ones are looked up in the background). */
export function useCollects(entries: Entry[]): Map<string, Collects> {
  const map = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => known,
  );
  useEffect(() => {
    if (entries.length) void fetchMissing(entries.map((e) => e.meta));
    else void ensureLoaded();
  }, [entries]);
  return map;
}

/** One edition (e.g. on its own page). */
export function useCollectsOf(comic: ComicLite | null): Collects | undefined {
  const map = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => known,
  );
  useEffect(() => {
    if (comic?.format === 'collection') void fetchMissing([comic]);
  }, [comic?.id, comic?.format]); // eslint-disable-line react-hooks/exhaustive-deps
  return comic ? map.get(comic.id) : undefined;
}
