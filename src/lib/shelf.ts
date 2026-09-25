// Ordering and money math for the My Comics shelves and the portfolio.
import type { ComicLite, Entry } from '../types';

/** Issue numbers as sortable numbers: "10" → 10, "½" → 0.5, "1.MU" → 1. */
export function issueNum(n: string | null | undefined): number {
  if (n == null || n === '') return Number.POSITIVE_INFINITY;
  if (n.trim() === '½') return 0.5;
  const m = n.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : Number.POSITIVE_INFINITY;
}

/** Series A→Z, then issue number numerically, then title. */
export function compareComics(a: ComicLite, b: ComicLite): number {
  const s = (a.series ?? a.title).localeCompare(b.series ?? b.title, undefined, { sensitivity: 'base' });
  if (s) return s;
  const n = issueNum(a.number) - issueNum(b.number);
  if (n && Number.isFinite(n)) return n;
  if (issueNum(a.number) !== issueNum(b.number)) return Number.isFinite(issueNum(a.number)) ? -1 : 1;
  return a.title.localeCompare(b.title);
}

export type ShelfSort = 'added' | 'read' | 'rating' | 'series' | 'release' | 'value' | 'price';

export interface ShelfOpts {
  shelf: 'owned' | 'read' | 'wishlist';
  sort: ShelfSort;
  q?: string;
  publisher?: string;
  year?: number;
  format?: 'issue' | 'collection';
  rating?: number;
}

const releaseDesc = (a: Entry, b: Entry) => {
  const x = a.meta.releaseDate;
  const y = b.meta.releaseDate;
  if (x && y) return y.localeCompare(x);
  return x ? -1 : y ? 1 : 0;
};

/** One shelf of My Comics, filtered and sorted. */
export function shelfView(entries: Entry[], o: ShelfOpts): Entry[] {
  const q = o.q?.trim().toLowerCase();
  const out = entries.filter((e) => {
    if (o.shelf === 'owned' ? !e.owned : o.shelf === 'read' ? !e.read : !e.wishlist) return false;
    if (q && ![e.meta.title, e.meta.series, e.meta.publisher].some((s) => s?.toLowerCase().includes(q))) return false;
    if (o.publisher && e.meta.publisher !== o.publisher) return false;
    if (o.year && !(e.meta.releaseDate ?? '').startsWith(String(o.year))) return false;
    if (o.format && e.meta.format !== o.format) return false;
    if (o.rating != null && e.rating !== o.rating) return false;
    return true;
  });
  const byRead = (a: Entry, b: Entry) => (b.readAt ?? '').localeCompare(a.readAt ?? '') || b.updatedAt.localeCompare(a.updatedAt);
  const cmp: Record<ShelfSort, (a: Entry, b: Entry) => number> = {
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),
    read: byRead,
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byRead(a, b),
    series: (a, b) => compareComics(a.meta, b.meta),
    release: (a, b) => releaseDesc(a, b) || compareComics(a.meta, b.meta),
    value: (a, b) => (valueOf(b).amount ?? -1) - (valueOf(a).amount ?? -1),
    price: (a, b) => (b.meta.price ?? -1) - (a.meta.price ?? -1),
  };
  return out.sort(cmp[o.sort]);
}

export type ValueBasis = 'yours' | 'market' | 'cover';

/** What one owned comic is worth: your value › market estimate › cover price × copies. */
export function valueOf(e: Entry): { amount: number | null; basis: ValueBasis | null } {
  if (!e.owned) return { amount: null, basis: null };
  if (e.value != null) return { amount: e.value, basis: 'yours' };
  if (e.est != null) return { amount: e.est, basis: 'market' };
  if (e.meta.price != null) {
    const copies = Math.max(1, e.variants.length);
    return { amount: Math.round(e.meta.price * copies * 100) / 100, basis: 'cover' };
  }
  return { amount: null, basis: null };
}

export function portfolio(entries: Entry[]) {
  let total = 0;
  let owned = 0;
  let paid = 0;
  const basis = { yours: 0, market: 0, cover: 0, none: 0 };
  const pubs = new Map<string, { publisher: string; value: number; count: number }>();
  const valued: { e: Entry; amount: number }[] = [];
  for (const e of entries) {
    if (!e.owned) continue;
    owned++;
    if (e.paid != null) paid += e.paid;
    const v = valueOf(e);
    if (v.basis) basis[v.basis]++;
    else basis.none++;
    const amount = v.amount ?? 0;
    total += amount;
    const pub = e.meta.publisher ?? 'Other';
    const row = pubs.get(pub) ?? { publisher: pub, value: 0, count: 0 };
    row.value += amount;
    row.count++;
    pubs.set(pub, row);
    if (v.amount != null) valued.push({ e, amount: v.amount });
  }
  return {
    total: Math.round(total * 100) / 100,
    owned,
    paid: Math.round(paid * 100) / 100,
    basis,
    byPublisher: [...pubs.values()].sort((a, b) => b.value - a.value || b.count - a.count),
    top: valued.sort((a, b) => b.amount - a.amount).map((x) => x.e),
  };
}
