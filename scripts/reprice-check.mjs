// Read-only: recompute a user's portfolio with the app's current matching
// against live PriceCharting data, and show old vs new value per comic.
// usage: npx vite-node scripts/reprice-check.mjs <username>
import fs from 'node:fs';
import { pickProduct, pcMoney, variantQuery } from '../src/lib/pricing';
import { estimateCopies, valueOf } from '../src/lib/shelf';

const cfg = JSON.parse(fs.readFileSync('C:/Users/S0000005749/Desktop/LetterSizd/web-deploy.json', 'utf8'));
const BASE = 'https://fotppunwikhxhvzzlgfy.supabase.co';
const H = { apikey: cfg.supabaseServiceKey, Authorization: `Bearer ${cfg.supabaseServiceKey}` };
const get = async (p) => (await fetch(`${BASE}/rest/v1/${p}`, { headers: H })).json();

const who = process.argv[2] ?? 'MLGGStaR';
const [prof] = await get(`profiles?select=id,username&username=eq.${encodeURIComponent(who)}`);
const rows = await get(`comic_entries?select=*&user_id=eq.${prof.id}&owned=eq.true`);

const cache = new Map();
const search = async (q) => {
  if (!cache.has(q)) {
    await new Promise((r) => setTimeout(r, 350));
    const r = await fetch(`https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json', Origin: 'https://mlggstar.github.io' } });
    cache.set(q, (await r.json()).products ?? []);
  }
  return cache.get(q);
};
const picked = new Map();
// the same query order and matching as src/api/prices.ts priceFor
const lookup = async (c, variantName) => {
  if (c.format !== 'issue' || !c.number || !c.series) return null;
  const year = Number((c.releaseDate ?? '').slice(0, 4)) || null;
  const want = { series: c.series, number: c.number, year, variantName };
  const base = `${c.series} #${c.number}`;
  for (const q of [base, variantName ? `${base} ${variantQuery(variantName)}` : null, year ? `${base} ${year}` : null].filter(Boolean)) {
    const p = pickProduct(await search(q), want);
    if (p) {
      picked.set(`${c.id}:${variantName ?? ''}`, `${p.productName} (via "${q}")`);
      const grades = {};
      if (pcMoney(p.price3) != null) grades['6.0'] = pcMoney(p.price3);
      if (pcMoney(p.price2) != null) grades['8.0'] = pcMoney(p.price2);
      return { raw: pcMoney(p.price1), grades };
    }
  }
  picked.set(`${c.id}:${variantName ?? ''}`, 'no listing → cover price');
  return null;
};

let oldTotal = 0;
let newTotal = 0;
for (const r of rows.sort((a, b) => (a.meta.title > b.meta.title ? 1 : -1))) {
  const e = { comicId: r.comic_id, owned: r.owned, read: r.read, wishlist: r.wishlist, rating: r.rating, readAt: r.read_at, review: r.review, variants: r.variants ?? [], paid: r.paid, value: r.value, est: r.est == null ? null : Number(r.est), meta: r.meta, addedAt: r.added_at, updatedAt: r.updated_at };
  const before = valueOf(e).amount ?? 0;
  const est = await estimateCopies(e, lookup);
  const after = valueOf({ ...e, est }).amount ?? 0;
  oldTotal += before;
  newTotal += after;
  const how = e.variants.map((v) => `${v.name} → ${picked.get(`${e.comicId}:${v.id === e.comicId ? '' : v.name}`) ?? (e.meta.format === 'issue' ? 'collector photo → cover price' : 'collected edition → cover price')}`).join('; ') || 'cover not picked → cover price';
  const flag = Math.abs(after - before) > 1 ? (after < before ? '▼' : '▲') : ' ';
  console.log(`${flag} ${e.meta.title.padEnd(34)} ${e.meta.releaseDate ?? '????'}  $${before.toFixed(2).padStart(8)} → $${after.toFixed(2).padStart(8)}   ${how}`);
}
console.log(`\ntotal $${oldTotal.toFixed(2)} → $${newTotal.toFixed(2)}`);
