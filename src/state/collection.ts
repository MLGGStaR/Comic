// The signed-in user's collection: IndexedDB copy for instant boots,
// Supabase as the source of truth, optimistic edits with rollback.
import { useSyncExternalStore } from 'react';
import { supabase } from '../supabase';
import { idbGet, idbSet } from '../lib/idb';
import { applyPatch, type EntryPatch } from '../lib/entry';
import type { ComicLite, Entry } from '../types';
import { toast } from '../ui/toast';

interface Row {
  user_id: string;
  comic_id: string;
  owned: boolean;
  read: boolean;
  wishlist: boolean;
  rating: number | string | null;
  read_at: string | null;
  review: string | null;
  variants: Entry['variants'] | null;
  paid: number | string | null;
  value: number | string | null;
  est: number | string | null;
  meta: ComicLite;
  added_at: string;
  updated_at: string;
}

const num = (v: number | string | null): number | null => (v == null ? null : Number(v));

export function rowToEntry(r: Row): Entry {
  return {
    comicId: r.comic_id,
    owned: r.owned,
    read: r.read,
    wishlist: r.wishlist,
    rating: num(r.rating),
    readAt: r.read_at,
    review: r.review,
    variants: r.variants ?? [],
    paid: num(r.paid),
    value: num(r.value),
    est: num(r.est),
    meta: r.meta,
    addedAt: r.added_at,
    updatedAt: r.updated_at,
  };
}

function entryToRow(userId: string, e: Entry): Row {
  return {
    user_id: userId,
    comic_id: e.comicId,
    owned: e.owned,
    read: e.read,
    wishlist: e.wishlist,
    rating: e.rating,
    read_at: e.readAt,
    review: e.review,
    variants: e.variants,
    paid: e.paid,
    value: e.value,
    est: e.est,
    meta: e.meta,
    added_at: e.addedAt,
    updated_at: e.updatedAt,
  };
}

export async function fetchEntries(userId: string): Promise<Entry[]> {
  const out: Entry[] = [];
  // page through (PostgREST caps a response at 1000 rows)
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('comic_entries')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data as Row[]) ?? [];
    out.push(...rows.map(rowToEntry));
    if (rows.length < 1000) break;
  }
  return out;
}

type State = { userId: string | null; entries: Map<string, Entry>; loaded: boolean; syncing: boolean };

let state: State = { userId: null, entries: new Map(), loaded: false, syncing: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  emit();
};
const persist = () => {
  if (state.userId) void idbSet(`entries:${state.userId}`, [...state.entries.values()]);
};

export const collection = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,

  async load(userId: string) {
    if (state.userId !== userId) {
      const cached = await idbGet<Entry[]>(`entries:${userId}`);
      set({ userId, entries: new Map((cached ?? []).map((e) => [e.comicId, e])), loaded: !!cached });
    }
    set({ syncing: true });
    try {
      const fresh = await fetchEntries(userId);
      if (state.userId !== userId) return;
      set({ entries: new Map(fresh.map((e) => [e.comicId, e])), loaded: true });
      persist();
    } catch {
      set({ loaded: true }); // offline: keep the cached copy
    } finally {
      set({ syncing: false });
    }
  },

  clear() {
    set({ userId: null, entries: new Map(), loaded: false });
  },

  entry(comicId: string): Entry | null {
    return state.entries.get(comicId) ?? null;
  },

  /** Apply a change optimistically, then save; rolls back if the save fails. */
  async patch(meta: ComicLite, patch: EntryPatch): Promise<Entry | null> {
    const userId = state.userId;
    if (!userId) {
      toast('Log in to save comics');
      return null;
    }
    const prev = state.entries.get(meta.id) ?? null;
    const next = applyPatch(prev, patch, meta, new Date());
    const entries = new Map(state.entries);
    if (next) entries.set(meta.id, next);
    else entries.delete(meta.id);
    set({ entries });
    persist();
    try {
      if (next) {
        const { error } = await supabase.from('comic_entries').upsert(entryToRow(userId, next));
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('comic_entries').delete().eq('user_id', userId).eq('comic_id', meta.id);
        if (error) throw new Error(error.message);
      }
      return next;
    } catch (e) {
      const back = new Map(state.entries);
      if (prev) back.set(meta.id, prev);
      else back.delete(meta.id);
      set({ entries: back });
      persist();
      toast(`Couldn't save — ${(e as Error).message}`, 'error');
      return prev;
    }
  },
};

export function useCollection(): State {
  return useSyncExternalStore(collection.subscribe, collection.get);
}

export function useEntry(comicId: string | null | undefined): Entry | null {
  const s = useCollection();
  return comicId ? s.entries.get(comicId) ?? null : null;
}
