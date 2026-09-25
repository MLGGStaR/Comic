// Friends' latest activity for Home: newest logs across everyone else.
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { idbGet, idbSet } from '../lib/idb';
import type { ComicLite } from '../types';
import { useOnRefresh } from './refresh';

export interface FeedItem {
  userId: string;
  comicId: string;
  owned: boolean;
  read: boolean;
  wishlist: boolean;
  rating: number | null;
  readAt: string | null;
  review: string | null;
  updatedAt: string;
  meta: ComicLite;
}

const TTL = 10 * 60e3;

export function useFriendsFeed(selfId: string | null): FeedItem[] {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nonce, setNonce] = useState(0);
  useOnRefresh(() => setNonce((n) => n + 1));

  useEffect(() => {
    if (!selfId) return;
    let alive = true;
    (async () => {
      const cached = await idbGet<{ t: number; data: FeedItem[] }>('home:friends');
      if (cached && alive) setItems(cached.data);
      if (cached && !nonce && Date.now() - cached.t < TTL) return;
      const { data, error } = await supabase
        .from('comic_entries')
        .select('user_id, comic_id, owned, read, wishlist, rating, read_at, review, updated_at, meta')
        .neq('user_id', selfId)
        .order('updated_at', { ascending: false })
        .limit(80);
      if (error || !data || !alive) return;
      const rows = (data as Record<string, unknown>[]).map((r) => ({
        userId: r.user_id as string,
        comicId: r.comic_id as string,
        owned: r.owned as boolean,
        read: r.read as boolean,
        wishlist: r.wishlist as boolean,
        rating: r.rating == null ? null : Number(r.rating),
        readAt: (r.read_at as string | null) ?? null,
        review: (r.review as string | null) ?? null,
        updatedAt: r.updated_at as string,
        meta: r.meta as ComicLite,
      }));
      setItems(rows);
      void idbSet('home:friends', { t: Date.now(), data: rows });
    })();
    return () => {
      alive = false;
    };
  }, [selfId, nonce]);

  return items;
}
