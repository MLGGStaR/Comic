// Longbox comic data API (Supabase Edge Function).
//   GET  ?op=search&q=absolute batman #2
//   GET  ?op=comic&id=8081353&title=…&seriesId=…
//   GET  ?op=series&id=178012
//   GET  ?op=week&date=2026-09-23
//   GET  ?op=upc&code=76194138584600211
//   GET  ?op=price&id=…&title=…
//   POST ?op=scan   {image: base64 jpeg}
// Everything is normalised into the app's ComicLite / ComicDetail shapes and
// cached in comic_cache so the sources see as few requests as possible.
import { cached, cacheGet, cachePut, cacheGetMany, cachePutMany, upcGet, upcPut } from '../_shared/cache.ts';
import { readCover, matchCover, shortlist, classifyGenres, type Candidate } from './scan.ts';
import { decodeBarcode } from '../_shared/barcode.ts';
import { normalize } from '../_shared/query.ts';
import { splitTitle } from '../_shared/locg.ts';
import * as locg from './locgApi.ts';
import { cbrForIssue } from './cbrApi.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const HOUR = 3600e3;
const DAY = 24 * HOUR;

const json = (data: unknown, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...(maxAge ? { 'Cache-Control': `public, max-age=${maxAge}` } : {}) },
  });

function weekTtl(iso: string): number {
  const age = Date.now() - Date.parse(`${iso}T00:00:00Z`);
  return age > 21 * DAY ? 7 * DAY : 6 * HOUR;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const u = new URL(req.url);
  const op = u.searchParams.get('op') ?? '';
  const p = (k: string) => u.searchParams.get(k) ?? '';
  const force = p('fresh') === '1';
  try {
    switch (op) {
      case 'search': {
        const q = normalize(p('q'));
        if (q.length < 2) return json({ top: null, more: [] });
        return json(await cached(`search:${q}`, 6 * HOUR, () => locg.search(q), { force }));
      }
      case 'series': {
        const id = p('id');
        if (!/^\d+$/.test(id)) return json({ error: 'bad id' }, 400);
        return json(await cached(`series:${id}`, 12 * HOUR, () => locg.series(id), { force }));
      }
      case 'week': {
        const date = p('date');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad date' }, 400);
        return json(await cached(`week:${date}`, weekTtl(date), () => locg.week(date), { force }));
      }
      case 'comic': {
        const id = p('id');
        if (!/^\d+$/.test(id)) return json({ error: 'bad id' }, 400);
        const hint = { title: p('title') || null, seriesId: p('seriesId') || null, series: p('series') || null, publisher: p('publisher') || null };
        const detail = await cached(`comic:${id}`, 12 * HOUR, () => comicWithReviews(id, hint, p('debug') === '1'), { force });
        return json(detail);
      }
      case 'upc':
        return json(await lookupCode(p('code')));
      case 'genres': {
        if (req.method !== 'POST') return json({ error: 'POST series' }, 405);
        const uid = userId(req);
        if (!uid) return json({ error: 'Log in first' }, 401);
        const body = (await req.json().catch(() => ({}))) as { series?: { key: string; title: string; publisher: string | null }[] };
        const series = (body.series ?? []).filter((s) => s?.key && s?.title).slice(0, 200);
        return json(await seriesGenres(uid, series));
      }
      case 'scan': {
        if (req.method !== 'POST') return json({ error: 'POST an image' }, 405);
        const uid = userId(req);
        if (!uid) return json({ error: 'Log in to scan covers' }, 401);
        if (!(await allowScan(uid))) return json({ error: 'Scan limit reached — try again in a bit' }, 429);
        const body = (await req.json().catch(() => ({}))) as { image?: string; debug?: boolean };
        if (!body.image || body.image.length < 1000) return json({ error: 'No photo' }, 400);
        if (body.image.length > 7_000_000) return json({ error: 'Photo too large' }, 413);
        return json(await scanCover(body.image, !!body.debug));
      }
      default:
        return json({ error: `unknown op "${op}"` }, 400);
    }
  } catch (e) {
    console.error(op, e);
    return json({ error: (e as Error).message || 'failed' }, 502);
  }
});

// ── comic detail + Comic Book Roundup scores, credits and reviews ───────────
const stars = (score10: number | null | undefined) => (score10 == null ? null : Math.round(score10) / 2);

function cbrLookup(id: string, seriesId: string, publisher: string | null, series: string | null, number: string, debug: boolean) {
  return cached(`seriesinfo:${seriesId}`, 30 * DAY, () => locg.seriesInfo(seriesId)).then((info) =>
    cached(
      `cbr:issue:${id}`,
      DAY,
      async () =>
        (await cbrForIssue({ seriesId, publisher: publisher ?? info.publisher, series: series ?? info.title, year: info.startYear, number })) ?? {
          none: true,
          year: info.startYear,
        },
      { force: debug },
    ),
  );
}

async function comicWithReviews(id: string, hint: locg.Hint, debug = false) {
  // with a series hint the review lookup can start in parallel with the detail
  const t = splitTitle(hint.title ?? '');
  const early =
    hint.seriesId && t.format === 'issue' && t.number
      ? cbrLookup(id, hint.seriesId, hint.publisher, hint.series ?? t.series, t.number, debug).catch(() => null)
      : null;
  const d = await locg.comic(id, hint);
  if (d.format !== 'issue' || !d.seriesId || !d.number) return d;
  try {
    const cb = (await early) ?? (await cbrLookup(id, d.seriesId, d.publisher, d.series, d.number, debug));
    if ('none' in cb) return debug ? { ...d, _debug: { cbr: cb } } : d;
    return {
      ...d,
      creators: cb.creators.length ? cb.creators : d.creators,
      criticScore: cb.criticScore,
      criticCount: cb.criticCount,
      userScore: cb.userScore,
      userCount: cb.userCount,
      rating: stars(cb.userScore ?? cb.criticScore),
      ratingCount: cb.userCount,
      reviewsUrl: cb.url,
      reviews: [
        ...cb.critics.map((r) => ({
          source: r.reviewer ?? 'Critic',
          user: r.outlet ?? r.reviewer ?? 'Critic',
          rating: stars(r.score),
          text: r.excerpt ?? '',
          date: r.date,
          url: r.url,
          critic: true,
        })),
        ...cb.users.map((r) => ({
          source: 'Comic Book Roundup',
          user: r.user,
          avatar: r.avatar,
          rating: stars(r.score),
          text: r.text,
          date: r.date,
          url: cb.url,
          critic: false,
        })),
      ],
    };
  } catch (e) {
    console.error('cbr', e);
    return d;
  }
}

// ── cover scans ───────────────────────────────────────────────────────────
/** The signed-in user's id from the (already verified) JWT; null for anon. */
function userId(req: Request): string | null {
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '==='.slice((b64.length + 3) % 4)));
    return payload.role === 'authenticated' && payload.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

async function allowScan(uid: string): Promise<boolean> {
  const key = `rl:scan:${uid}:${new Date().toISOString().slice(0, 13)}`;
  const hit = await cacheGet<number>(key);
  const n = (hit?.data ?? 0) + 1;
  if (n > 60) return false;
  await cachePut(key, n);
  return true;
}

// genre tags per series: cached forever, only misses go to Claude (≤40 per call)
async function seriesGenres(uid: string, series: { key: string; title: string; publisher: string | null }[]) {
  const keys = series.map((s) => `genre:${s.key}`);
  const hits = await cacheGetMany<string[]>(keys);
  const out: Record<string, string[]> = {};
  const missing = series.filter((s) => {
    const g = hits.get(`genre:${s.key}`);
    if (g) out[s.key] = g;
    return !g;
  });
  if (missing.length) {
    const hourKey = `rl:genre:${uid}:${new Date().toISOString().slice(0, 13)}`;
    const used = (await cacheGet<number>(hourKey))?.data ?? 0;
    if (used < 30) {
      await cachePut(hourKey, used + 1);
      for (let i = 0; i < missing.length; i += 40) {
        const batch = missing.slice(i, i + 40);
        const tags = await classifyGenres(batch).catch(() => ({}) as Record<string, string[]>);
        const rows = batch.filter((s) => tags[s.key]?.length).map((s) => ({ key: `genre:${s.key}`, data: tags[s.key] }));
        await cachePutMany(rows);
        for (const r of rows) out[r.key.slice(6)] = r.data as string[];
      }
    }
  }
  return out;
}

async function scanCover(image: string, debug = false) {
  const read = await readCover(image);
  const readOut = {
    series: read.series ?? undefined,
    issue: read.issue_number ?? (read.volume_number != null ? `Vol. ${read.volume_number}` : read.subtitle ?? undefined),
    publisher: read.publisher ?? undefined,
    variant: read.variant_hint ?? read.cover_artist ?? undefined,
  };
  if (!read.is_comic || !read.series) return { comic: null, candidates: [], read: readOut, note: ‘That doesn’t look like a comic cover’ };

  // Reject low-confidence reads: if we’re unsure about the series or number, the search will be wrong
  if (read.confidence < 0.5) {
    return { comic: null, candidates: [], read: readOut, note: ‘Could not read the comic clearly — try a better photo.’ };
  }

  const q =
    read.format === 'collected_edition' && read.volume_number != null
      ? `${read.series} vol ${read.volume_number}`
      : read.issue_number
      ? `${read.series} #${read.issue_number}${read.year ? ` (${read.year})` : ''}`
      : read.series;
  let res = await cached(`search:${normalize(q)}`, 6 * HOUR, () => locg.search(q));
  if (!res.top && read.year) res = await cached(`search:${normalize(q.replace(/\s*\(\d{4}\)$/, ''))}`, 6 * HOUR, () => locg.search(q.replace(/\s*\(\d{4}\)$/, '')));
  const others = (res.more ?? []).filter((h) => h.kind === 'comic').map((h) => (h as { comic: locg.Lite }).comic);

  if (!res.top || res.top.kind === 'series') {
    const sid = res.top?.kind === 'series' ? res.top.series.id : null;
    const s = sid ? await cached(`series:${sid}`, 12 * HOUR, () => locg.series(sid)) : null;
    // a trade whose cover shows a subtitle ("The Zoo") but no volume number
    if (s && !read.issue_number && s.collections.length) {
      const want = new Set(`${read.subtitle ?? ''}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
      const fmtRank = (t: string) => (/deluxe|omnibus|compendium|box set/i.test(t) ? 2 : /\bHC$/i.test(t) ? 1 : 0);
      const scored = s.collections
        .map((c) => {
          const t = splitTitle(c.title);
          const hits = c.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => want.has(w)).length;
          return { c, score: hits + (read.volume_number != null && t.volume === read.volume_number ? 5 : 0) - fmtRank(c.title) * 0.1 };
        })
        .sort((a, b) => b.score - a.score);
      if (scored[0] && scored[0].score > 0.5) {
        return { comic: scored[0].c, candidates: scored.slice(1, 8).map((x) => x.c), read: readOut, confidence: read.confidence };
      }
      if (read.format === 'collected_edition') {
        return { comic: null, candidates: s.collections, read: readOut, note: `${s.title} — which edition?` };
      }
    }
    return { comic: null, candidates: s ? s.issues.slice(-12).reverse() : others, read: readOut, note: s ? `${s.title} — which one?` : null };
  }

  const top = res.top.comic;
  if (top.format !== 'issue') return { comic: top, candidates: others, read: readOut, confidence: read.confidence, _debug: debug ? { read, q, top: top.title } : undefined };

  // every cover of that issue → which one is in the photo?
  const d = await cached(`comic:${top.id}`, 12 * HOUR, () => comicWithReviews(top.id, { title: top.title, seriesId: top.seriesId, series: top.series, publisher: top.publisher }));
  const all: Candidate[] = [{ id: top.id, name: 'Main cover', cover: d.cover ?? top.cover }, ...d.variants.map((v) => ({ id: v.id, name: v.name, cover: v.cover }))];
  const list = shortlist(all, [read.variant_hint, read.cover_artist].filter(Boolean).join(' '));
  let pick: Candidate = list[0];
  let confidence = read.confidence;
  const dbg: Record<string, unknown> = { read, q, top: `${top.id} ${top.title} (${top.publisher})`, allCovers: all.length, shortlist: list.map((c) => c.name) };
  if (list.length > 1) {
    const m = await matchCover(image, list).catch((e) => {
      dbg.matchError = String(e);
      return null;
    });
    dbg.match = m;
    if (m?.index != null) {
      pick = list[m.index];
      confidence = Math.min(read.confidence, m.confidence);
    } else if (m) {
      confidence = Math.min(read.confidence, 0.5);
    }
  }
  const isVariant = pick.id !== top.id;
  return {
    comic: top,
    variantId: isVariant ? pick.id : null,
    variantCover: isVariant ? pick.cover : null,
    note: isVariant ? pick.name : null,
    confidence,
    candidates: others,
    read: readOut,
    _debug: debug ? { ...dbg, pick: pick.name } : undefined,
  };
}

// ── barcodes ──────────────────────────────────────────────────────────────
async function lookupCode(raw: string) {
  const bc = decodeBarcode(raw);
  if (!bc) return { comic: null, candidates: [], note: 'That barcode didn’t read cleanly — try again.' };

  if (bc.kind === 'upc' && bc.addon) {
    const full = `${bc.upc}${bc.addon}`;
    const hit = await cached(`upc:${full}`, 30 * DAY, async () => (await locg.byUpc(full)) ?? { comic: null, candidates: [] });
    if (hit.comic) {
      if ('seriesId' in hit && hit.seriesId) void upcPut({ code: bc.upc, series_id: hit.seriesId as string, source: 'locg' });
      return hit;
    }
    // not in the source yet: fall back to the series we've learned for this UPC
    const learned = await upcGet(bc.upc);
    if (learned?.series_id) {
      const s = await cached(`series:${learned.series_id}`, 12 * HOUR, () => locg.series(learned.series_id!));
      const want = String(bc.issue);
      const comic = s.issues.find((i) => (i.number ?? '').replace(/^0+(?=\d)/, '') === want) ?? null;
      return { comic, candidates: comic ? [] : s.issues.slice(-12).reverse(), note: comic ? null : `Couldn’t find #${want} in ${s.title}` };
    }
    return { comic: null, candidates: [] };
  }

  if (bc.kind === 'upc') {
    // main code without the 5-digit add-on: we can only narrow it to a series
    const learned = await upcGet(bc.upc);
    if (learned?.series_id) {
      const s = await cached(`series:${learned.series_id}`, 12 * HOUR, () => locg.series(learned.series_id!));
      return { comic: null, candidates: s.issues.slice(-12).reverse(), note: `${s.title} — which issue?` };
    }
    return { comic: null, candidates: [] };
  }

  // ISBN (collected editions): book title from Open Library / Google Books → search
  const title = await cached(`isbn:${bc.isbn}`, 30 * DAY, () => isbnTitle(bc.isbn).then((t) => t ?? ''));
  if (!title) return { comic: null, candidates: [] };
  const q = bookQuery(title);
  const res = await cached(`search:${normalize(q)}`, 6 * HOUR, () => locg.search(q));
  const top = res.top && res.top.kind === 'comic' ? res.top.comic : null;
  const more = (res.more ?? []).filter((h) => h.kind === 'comic').map((h) => (h as { comic: locg.Lite }).comic);
  return { comic: top, candidates: more, note: top ? null : `Found “${title}” — pick the right edition` };
}

/** "Absolute Batman: Vol. 1: The Zoo" → "Absolute Batman vol 1" (what search understands). */
function bookQuery(title: string): string {
  const vol = title.match(/\bVol(?:ume)?\.?\s*(\d+)/i);
  if (!vol || vol.index == null) return title;
  const base = title.slice(0, vol.index).replace(/[:,.\s–-]+$/, '');
  return `${base} vol ${vol[1]}`;
}

async function isbnTitle(isbn: string): Promise<string | null> {
  try {
    const r = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const b = await r.json();
      if (b?.title) return [b.title, b.subtitle].filter(Boolean).join(': ');
    }
  } catch {
    // try the next source
  }
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    if (r.ok) {
      const j = await r.json();
      const v = j.items?.[0]?.volumeInfo;
      if (v?.title) return [v.title, v.subtitle].filter(Boolean).join(': ');
    }
  } catch {
    // none
  }
  return null;
}
