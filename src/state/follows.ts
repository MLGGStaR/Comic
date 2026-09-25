// Series you follow = your pull list. New issues of followed series (and of
// any series you own or read) are highlighted on Home and in the Calendar.
import { useSyncExternalStore } from 'react';
import { supabase } from '../supabase';
import { idbGet, idbSet } from '../lib/idb';
import { toast } from '../ui/toast';

export interface Follow {
  seriesId: string;
  title: string;
  publisher: string | null;
  cover: string | null;
}

let follows = new Map<string, Follow>();
let userId: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const persist = () => userId && void idbSet(`follows:${userId}`, [...follows.values()]);

export async function loadFollows(uid: string | null) {
  userId = uid;
  if (!uid) {
    follows = new Map();
    emit();
    return;
  }
  const cached = await idbGet<Follow[]>(`follows:${uid}`);
  if (cached) {
    follows = new Map(cached.map((f) => [f.seriesId, f]));
    emit();
  }
  const { data, error } = await supabase.from('comic_follows').select('series_id, title, publisher, cover').eq('user_id', uid);
  if (error || !data) return;
  follows = new Map(
    (data as { series_id: string; title: string; publisher: string | null; cover: string | null }[]).map((r) => [
      r.series_id,
      { seriesId: r.series_id, title: r.title, publisher: r.publisher, cover: r.cover },
    ]),
  );
  emit();
  persist();
}

export async function toggleFollow(f: Follow): Promise<void> {
  if (!userId) return toast('Log in to follow series');
  const on = follows.has(f.seriesId);
  const next = new Map(follows);
  if (on) next.delete(f.seriesId);
  else next.set(f.seriesId, f);
  follows = next;
  emit();
  persist();
  const { error } = on
    ? await supabase.from('comic_follows').delete().eq('user_id', userId).eq('series_id', f.seriesId)
    : await supabase
        .from('comic_follows')
        .insert({ user_id: userId, series_id: f.seriesId, title: f.title, publisher: f.publisher, cover: f.cover });
  if (error) {
    toast(`Couldn't save — ${error.message}`, 'error');
    void loadFollows(userId);
  } else {
    toast(on ? `Unfollowed ${f.title}` : `Following ${f.title} — new issues show on Home`);
  }
}

export function useFollows(): Map<string, Follow> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => follows,
  );
}
