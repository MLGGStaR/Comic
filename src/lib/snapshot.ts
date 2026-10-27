// Each logged comic keeps a snapshot of its details (title, date, cover…) so
// shelves draw instantly and offline. Upcoming books get delayed and their
// placeholder covers replaced, so snapshots are refreshed from the source.
import type { ComicDetail, ComicLite } from '../types';

export function toLite(d: ComicDetail): ComicLite {
  return {
    id: d.id,
    title: d.title,
    series: d.series,
    seriesId: d.seriesId,
    number: d.number,
    format: d.format,
    formatLabel: d.formatLabel ?? null,
    publisher: d.publisher,
    releaseDate: d.releaseDate,
    cover: d.cover,
    price: d.price,
    pulls: d.pulls ?? null,
    rating: d.rating ?? null,
  };
}

const FIELDS = ['title', 'series', 'seriesId', 'number', 'format', 'formatLabel', 'publisher', 'releaseDate', 'price'] as const;
/** the image itself, not its size rendition or cache-busting query */
const coverKey = (u: string | null | undefined) => (u ?? '').replace(/\?.*$/, '').replace(/\/(?:small|medium|large)-(\d+)/, '/$1');

/** The stored snapshot with whatever really changed at the source, or null when
 *  nothing did. A value the source no longer gives never wipes a stored one. */
export function refreshedMeta(stored: ComicLite, fresh: ComicDetail): ComicLite | null {
  const now = toLite(fresh);
  const next: ComicLite = { ...stored };
  let changed = false;
  for (const k of FIELDS) {
    const v = now[k];
    if (v == null || v === stored[k]) continue;
    (next as unknown as Record<string, unknown>)[k] = v;
    changed = true;
  }
  if (now.cover && coverKey(now.cover) !== coverKey(stored.cover)) {
    next.cover = now.cover;
    changed = true;
  }
  return changed ? next : null;
}

const HOUR = 3600e3;
const DAY = 24 * HOUR;

/** Upcoming or recent comics (or undated ones) change often: twice a day;
 *  older ones: once a month. */
export function dueForCheck(meta: ComicLite, lastChecked: number, now: number): boolean {
  const released = meta.releaseDate ? Date.parse(`${meta.releaseDate}T12:00:00Z`) : NaN;
  const active = Number.isNaN(released) || released > now - 60 * DAY;
  return now - lastChecked > (active ? 12 * HOUR : 30 * DAY);
}
