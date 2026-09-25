// Ordering and money math for the My Comics shelves and the portfolio.
import type { ComicLite, Entry, Grade } from '../types';
import { gradedPrice, type GradedPrice } from './pricing';

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
  genre?: string;
  genreOf?: (e: Entry) => string[];
  read?: 'read' | 'unread'; // e.g. the comics you own but haven't read yet
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
    if (o.genre && !(o.genreOf?.(e) ?? []).includes(o.genre)) return false;
    if (o.read && e.read !== (o.read === 'read')) return false;
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
export interface Worth {
  amount: number | null;
  basis: ValueBasis | null;
  /** owned, but which cover (1st print? variant? later printing?) isn't picked yet */
  unpicked?: true;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** What one owned comic is worth, decided by the covers you picked: your value ›
 *  their market estimate › their cover prices. With no cover picked we can't
 *  know which copy it is, so it counts at cover price and is flagged. */
export function valueOf(e: Entry): Worth {
  if (!e.owned) return { amount: null, basis: null };
  if (e.value != null) return { amount: e.value, basis: 'yours' };
  if (!e.variants.length) {
    return e.meta.price != null ? { amount: e.meta.price, basis: 'cover', unpicked: true } : { amount: null, basis: null, unpicked: true };
  }
  if (e.est != null) return { amount: e.est, basis: 'market' };
  const known = e.variants.map((v) => v.price ?? e.meta.price).filter((p): p is number => p != null);
  return known.length ? { amount: cents(known.reduce((s, p) => s + p, 0)), basis: 'cover' } : { amount: null, basis: null };
}

/** A listing's prices: raw (ungraded) and, where known, per grade ("6.0", "9.8"…). */
export interface PricePoint {
  raw: number | null;
  grades?: Record<string, number> | null;
}
export type PriceLookup = (c: ComicLite, variantName: string | null) => Promise<PricePoint | null>;

/** One copy's market value: its grade's price when slabbed, else raw. */
export function copyValue(p: PricePoint | null, grade: Grade | null | undefined): GradedPrice | { amount: number; basis: 'raw'; from: 'raw' } | null {
  if (!p) return null;
  if (grade) return gradedPrice({ ...(p.grades ?? {}), ...(p.raw != null ? { raw: p.raw } : {}) }, grade.grade);
  return p.raw != null ? { amount: p.raw, basis: 'raw', from: 'raw' } : null;
}

/** Market value of the covers you picked: each at its own listing (at its grade
 *  when slabbed), a cover with no listing (or a collector photo) at its cover
 *  price. null when no cover is picked or none of them is listed. */
export async function estimateCopies(e: Entry, price: PriceLookup): Promise<number | null> {
  if (!e.variants.length) return null;
  let sum = 0;
  let listed = false;
  for (const v of e.variants) {
    const custom = v.id.startsWith('custom:');
    const p = custom ? null : await price(e.meta, v.id === e.comicId ? null : v.name).catch(() => null);
    const worth = copyValue(p, v.grade);
    if (worth) {
      sum += worth.amount;
      listed = true;
    } else {
      sum += v.price ?? e.meta.price ?? 0;
    }
  }
  return listed ? cents(sum) : null;
}

/** What a collected edition holds, as looked up (null = unknown). */
export interface Collects {
  collects: string | null; // "House of M #1–8"
  issues: number | null;
}

/** How many single issues these comics add up to: an issue is one; a trade is
 *  your own count, else the looked-up one, else at least one (and listed). */
export function issueCount(entries: Entry[], known: Map<string, Collects>): { total: number; unknown: Entry[] } {
  let total = 0;
  const unknown: Entry[] = [];
  for (const e of entries) {
    if (e.meta.format !== 'collection') {
      total += 1;
      continue;
    }
    const n = e.issues ?? known.get(e.comicId)?.issues ?? null;
    if (n == null) unknown.push(e);
    total += n ?? 1;
  }
  return { total, unknown };
}

export function portfolio(entries: Entry[]) {
  let total = 0;
  let owned = 0;
  let paid = 0;
  const basis = { yours: 0, market: 0, cover: 0, none: 0 };
  const pubs = new Map<string, { publisher: string; value: number; count: number }>();
  const valued: { e: Entry; amount: number }[] = [];
  const unpicked: Entry[] = [];
  for (const e of entries) {
    if (!e.owned) continue;
    owned++;
    if (e.paid != null) paid += e.paid;
    const v = valueOf(e);
    if (v.unpicked) unpicked.push(e);
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
    unpicked,
  };
}
