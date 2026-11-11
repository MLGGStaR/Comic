// The Users page: everyone's shelves at a glance, valued exactly like their
// own portfolio page.
import type { Profile } from '../supabase';
import type { ComicLite, Entry } from '../types';
import { portfolio } from './shelf';

export interface UserSummary {
  tracked: number; // comics on any shelf
  comics: number; // owned
  read: number;
  wishlist: number;
  value: number; // estimated value of what they own
  recent: ComicLite[]; // most recently logged first
}

export function summarize(entries: Entry[]): UserSummary {
  return {
    tracked: entries.length,
    comics: entries.filter((e) => e.owned).length,
    read: entries.filter((e) => e.read).length,
    wishlist: entries.filter((e) => e.wishlist).length,
    value: portfolio(entries).total,
    recent: [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((e) => e.meta),
  };
}

/** You first, then the biggest collections, then everyone else A→Z. */
export function orderUsers(profiles: Profile[], selfId: string | null, tracked: (id: string) => number): Profile[] {
  return [...profiles].sort((a, b) => {
    if (a.id === selfId) return -1;
    if (b.id === selfId) return 1;
    return tracked(b.id) - tracked(a.id) || a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
  });
}
