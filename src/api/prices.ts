// Market values from PriceCharting, fetched straight from the phone (their
// Cloudflare blocks servers, including our Edge Function; the search endpoint
// allows our origin). The public search gives, for every comic, the raw
// (ungraded) price and graded 6.0 and 8.0. With the owner's PriceCharting API
// token (a paid subscription — optional) the full grade table comes too.
// Cached on-device for a day; requests are spaced out.
import type { ComicLite } from '../types';
import { idbGet, idbSet } from '../lib/idb';
import { pickProduct, pcMoney, variantQuery, type PcProduct } from '../lib/pricing';

export interface PriceEstimate {
  id: string; // PriceCharting product id
  raw: number | null; // ungraded
  grades: Record<string, number>; // "6.0", "8.0" (+ every grade with a token) → price
  full: boolean; // the full grade table (API token) rather than just 6.0 / 8.0
  name: string; // the PriceCharting listing, e.g. "Daredevil #1 (1998)"
  url: string;
  source: 'PriceCharting';
  at: number;
}

const DAY = 86400e3;
// bump when matching changes: cached picks from older rules are ignored
const CACHE_VERSION = 'p3';

let chain: Promise<unknown> = Promise.resolve();
const pace = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(() => new Promise((r) => setTimeout(r, 350))).then(fn);
  chain = run.catch(() => {});
  return run;
};

// several covers of one issue share their searches
const searches = new Map<string, Promise<PcProduct[]>>();
function pcSearch(q: string): Promise<PcProduct[]> {
  const key = q.toLowerCase();
  let p = searches.get(key);
  if (!p) {
    p = pace(async () => {
      const r = await fetch(`https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`prices ${r.status}`);
      const j = (await r.json()) as { products?: PcProduct[] };
      return j.products ?? [];
    });
    p.catch(() => searches.delete(key));
    searches.set(key, p);
  }
  return p;
}

// ── optional PriceCharting API token (full grade table) ─────────────────────
const TOKEN_KEY = 'lbx-pc-token';
export function pcToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setPcToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private mode: token lasts this session only
  }
}

// the API's price fields for comics (prices in pennies)
const API_GRADES: Record<string, string> = {
  'loose-price': 'raw',
  'condition-9-price': '2.0',
  'condition-13-price': '3.0',
  'cib-price': '4.0',
  'condition-14-price': '5.0',
  'new-price': '6.0',
  'condition-15-price': '7.0',
  'graded-price': '8.0',
  'condition-16-price': '9.0',
  'box-only-price': '9.2',
  'condition-17-price': '9.4',
  'condition-10-price': '9.6',
  'manual-only-price': '9.8',
  'bgs-10-price': '10.0',
};

/** The full price guide for one PriceCharting product (needs a subscription token). */
export async function fullGuide(id: string, token: string): Promise<Record<string, number>> {
  const r = await fetch(`https://www.pricecharting.com/api/product?t=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`);
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (j.status !== 'success') throw new Error(String(j['error-message'] ?? `PriceCharting API ${r.status}`));
  const out: Record<string, number> = {};
  for (const [field, grade] of Object.entries(API_GRADES)) {
    const pennies = Number(j[field]);
    if (pennies > 0) out[grade] = pennies / 100;
  }
  return out;
}

/** Estimated value of one copy (optionally a specific variant). null = unknown. */
export async function priceFor(c: ComicLite, variantName?: string | null): Promise<PriceEstimate | null> {
  if (c.format !== 'issue' || !c.number || !c.series) return null;
  const token = pcToken();
  const key = `price:${CACHE_VERSION}:${token ? 'full' : 'free'}:${c.id}:${variantName ?? ''}`;
  const hit = await idbGet<{ t: number; v: PriceEstimate | null }>(key);
  if (hit && Date.now() - hit.t < DAY) return hit.v;
  const year = Number((c.releaseDate ?? '').slice(0, 4)) || null;
  const want = { series: c.series, number: c.number, year, variantName };
  const base = `${c.series} #${c.number}`;
  // the plain search first; when its first page misses the listing, narrow it
  // down with the variant's own words, then the year
  const queries = [base, variantName ? `${base} ${variantQuery(variantName)}` : null, year ? `${base} ${year}` : null].filter((q): q is string => !!q);
  try {
    let p: PcProduct | null = null;
    for (const q of queries) {
      p = pickProduct(await pcSearch(q), want);
      if (p) break;
    }
    let v: PriceEstimate | null = null;
    if (p) {
      const grades: Record<string, number> = {};
      const g6 = pcMoney(p.price3);
      const g8 = pcMoney(p.price2);
      if (g6 != null) grades['6.0'] = g6;
      if (g8 != null) grades['8.0'] = g8;
      v = { id: p.id, raw: pcMoney(p.price1), grades, full: false, name: p.productName, url: `https://www.pricecharting.com/game/${p.id}`, source: 'PriceCharting', at: Date.now() };
      if (token) {
        const all = await fullGuide(p.id, token).catch(() => null);
        if (all) {
          const { raw, ...rest } = all;
          v = { ...v, raw: raw ?? v.raw, grades: { ...grades, ...rest }, full: true };
        }
      }
    }
    void idbSet(key, { t: Date.now(), v });
    return v;
  } catch {
    return hit?.v ?? null;
  }
}
