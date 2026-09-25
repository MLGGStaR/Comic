// Raw (ungraded) market value from PriceCharting's search endpoint, called
// straight from the browser (it allows our origin; their servers block the
// Edge Function). Cached on-device for a day; requests are spaced out.
import type { ComicLite } from '../types';
import { idbGet, idbSet } from '../lib/idb';
import { pickProduct, pcMoney, type PcProduct } from '../lib/pricing';

export interface PriceEstimate {
  raw: number | null; // ungraded
  vf: number | null; // 8.0
  fine: number | null; // 6.0
  name: string;
  url: string;
  source: 'PriceCharting';
  at: number;
}

const DAY = 86400e3;
let chain: Promise<unknown> = Promise.resolve();
const pace = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(() => new Promise((r) => setTimeout(r, 350))).then(fn);
  chain = run.catch(() => {});
  return run;
};

async function pcSearch(q: string): Promise<PcProduct[]> {
  return pace(async () => {
    const r = await fetch(`https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent(q)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`prices ${r.status}`);
    const j = (await r.json()) as { products?: PcProduct[] };
    return j.products ?? [];
  });
}

/** Estimated value of one copy (optionally a specific variant). null = unknown. */
export async function priceFor(c: ComicLite, variantName?: string | null): Promise<PriceEstimate | null> {
  if (c.format !== 'issue' || !c.number || !c.series) return null;
  const key = `price:${c.id}:${variantName ?? ''}`;
  const hit = await idbGet<{ t: number; v: PriceEstimate | null }>(key);
  if (hit && Date.now() - hit.t < DAY) return hit.v;
  const year = Number((c.releaseDate ?? '').slice(0, 4)) || null;
  const want = { series: c.series, number: c.number, year, variantName };
  try {
    let p = pickProduct(await pcSearch(`${c.series} #${c.number}`), want);
    if (!p && year) p = pickProduct(await pcSearch(`${c.series} #${c.number} ${year}`), want);
    const v: PriceEstimate | null = p
      ? {
          raw: pcMoney(p.price1),
          vf: pcMoney(p.price2),
          fine: pcMoney(p.price3),
          name: p.productName,
          url: `https://www.pricecharting.com/game/${p.id}`,
          source: 'PriceCharting',
          at: Date.now(),
        }
      : null;
    void idbSet(key, { t: Date.now(), v });
    return v;
  } catch {
    return hit?.v ?? null;
  }
}
