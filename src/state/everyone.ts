// Every user's shelves, summarised for the Users page. One paged read of all
// comic entries (readable by any signed-in user); the last result is kept
// on the phone so the page draws instantly, then refreshes.
import { useSyncExternalStore } from 'react';
import { supabase } from '../supabase';
import { idbGet, idbSet } from '../lib/idb';
import { summarize, type UserSummary } from '../lib/users';
import { rowToEntry } from './collection';
import type { Entry } from '../types';

type State = { byUser: Map<string, UserSummary>; loaded: boolean; error: string | null };
let state: State = { byUser: new Map(), loaded: false, error: null };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

const KEEP_RECENT = 6; // covers per user on the page
let inflight: Promise<void> | null = null;

export function loadEveryone(): Promise<void> {
  inflight ??= (async () => {
    if (!state.loaded) {
      const cached = await idbGet<[string, UserSummary][]>('everyone');
      if (cached?.length && !state.loaded) set({ byUser: new Map(cached), loaded: true });
    }
    try {
      const byUser = new Map<string, Entry[]>();
      for (let from = 0; from < 50000; from += 1000) {
        const { data, error } = await supabase
          .from('comic_entries')
          .select('*')
          .order('user_id')
          .order('comic_id')
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as (Parameters<typeof rowToEntry>[0] & { user_id: string })[];
        for (const r of rows) {
          const list = byUser.get(r.user_id) ?? [];
          list.push(rowToEntry(r));
          byUser.set(r.user_id, list);
        }
        if (rows.length < 1000) break;
      }
      const summaries = new Map([...byUser].map(([id, list]) => {
        const s = summarize(list);
        return [id, { ...s, recent: s.recent.slice(0, KEEP_RECENT) }] as [string, UserSummary];
      }));
      set({ byUser: summaries, loaded: true, error: null });
      void idbSet('everyone', [...summaries]);
    } catch (e) {
      set({ loaded: true, error: (e as Error).message });
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function useEveryone(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
