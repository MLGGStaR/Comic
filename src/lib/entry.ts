// The rules for toggling Have / Read / Wishlist on one comic. Pure, so the
// collection store and the tests share exactly one definition.
import type { ComicLite, Entry, OwnedVariant } from '../types';

export interface EntryPatch {
  owned?: boolean;
  read?: boolean;
  wishlist?: boolean;
  rating?: number | null;
  readAt?: string | null;
  review?: string | null;
  variants?: OwnedVariant[];
  paid?: number | null;
  value?: number | null;
  est?: number | null;
}

/** local calendar date, YYYY-MM-DD */
export function isoDay(d: Date): string {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function applyPatch(prev: Entry | null, patch: EntryPatch, meta: ComicLite, now: Date): Entry | null {
  const stamp = now.toISOString();
  const e: Entry = prev
    ? { ...prev, meta }
    : {
        comicId: meta.id,
        owned: false,
        read: false,
        wishlist: false,
        rating: null,
        readAt: null,
        review: null,
        variants: [],
        paid: null,
        value: null,
        est: null,
        meta,
        addedAt: stamp,
        updatedAt: stamp,
      };

  if (patch.variants !== undefined) {
    e.variants = patch.variants;
    if (patch.variants.length) e.owned = true;
  }
  if (patch.owned === true) e.owned = true;
  if (patch.owned === false) {
    e.owned = false;
    e.variants = [];
    e.paid = null;
    e.value = null;
    e.est = null;
  }
  if (e.owned) e.wishlist = false;
  else if (patch.wishlist !== undefined) e.wishlist = patch.wishlist;

  if (patch.paid !== undefined) e.paid = patch.paid;
  if (patch.value !== undefined) e.value = patch.value;
  if (patch.est !== undefined) e.est = patch.est;

  if (patch.read === false) {
    e.read = false;
    e.rating = null;
    e.readAt = null;
    e.review = null;
  } else {
    if (patch.rating != null) {
      e.rating = patch.rating;
      e.read = true;
    } else if (patch.rating === null) {
      e.rating = null;
    }
    if (patch.read === true) e.read = true;
    if (patch.review !== undefined) {
      e.review = patch.review;
      if (patch.review) e.read = true;
    }
    if (e.read) e.readAt = patch.readAt ?? e.readAt ?? isoDay(now);
  }

  if (!e.owned && !e.read && !e.wishlist) return null;
  e.updatedAt = stamp;
  return e;
}
