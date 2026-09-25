// Longbox comic data API (Supabase Edge Function).
//   GET  ?op=search&q=absolute batman #2
//   GET  ?op=comic&id=8081353&title=…&seriesId=…      (fast: detail + every cover)
//   GET  ?op=extras&id=8081353&title=…&seriesId=…     (reviews, scores, credits, prev/next)
//   GET  ?op=series&id=178012
//   GET  ?op=week&date=2026-09-23
//   GET  ?op=upc&code=76194138584600211
//   POST ?op=scan    {image: base64 jpeg, upc?: digits decoded on the phone}
//   POST ?op=genres  {series: [{key, title, publisher}]}
// Everything is normalised into the app's ComicLite / ComicDetail shapes and
// cached in comic_cache so the sources see as few requests as possible.
import { cached, cacheGet, cachePut, cacheGetMany, cachePutMany, customCoversFor, upcGet, upcPut } from '../_shared/cache.ts';
import { readCover, coarseRank, fineMatch, byHints, classifyGenres, DEFAULT_KNOBS, MODELS, type Candidate, type CoverRead, type Model, type ScanKnobs } from './scan.ts';
import { decodeBarcode } from '../_shared/barcode.ts';
import { normalize, parseQuery, type ParsedQuery } from '../_shared/query.ts';
import { splitTitle, rankSeries } from '../_shared/locg.ts';
import * as locg from './locgApi.ts';
import { cbrForIssue } from './cbrApi.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const HOUR = 3600e3;
const DAY = 24 * HOUR;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

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
  const hint = () => ({ title: p('title') || null, seriesId: p('seriesId') || null, series: p('series') || null, publisher: p('publisher') || null });
  try {
    switch (op) {
      case 'search': {
        const q = normalize(p('q'));
        if (q.length < 2) return json({ top: null, more: [] });
        return json(await cached(`search2:${q}`, 6 * HOUR, () => locg.search(q), { force }));
      }
      case 'series': {
        const id = p('id');
        if (!/^\d+$/.test(id)) return json({ error: 'bad id' }, 400);
        return json(await cached(`series2:${id}`, 12 * HOUR, () => locg.series(id), { force }));
      }
      case 'week': {
        const date = p('date');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad date' }, 400);
        return json(await cached(`week2:${date}`, weekTtl(date), () => locg.week(date), { force }));
      }
      case 'comic': {
        const id = p('id');
        if (!/^\d+$/.test(id)) return json({ error: 'bad id' }, 400);
        const core = await cached(`core:${id}`, 12 * HOUR, () => locg.comic(id, hint()), { force });
        return json(await withCustomCovers(core));
      }
      case 'extras': {
        const id = p('id');
        if (!/^\d+$/.test(id)) return json({ error: 'bad id' }, 400);
        return json(await cached(`extras:${id}`, 12 * HOUR, () => buildExtras(id, hint()), { force }));
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
        const body = (await req.json().catch(() => ({}))) as { image?: string; upc?: string; debug?: boolean; knobs?: Partial<ScanKnobs> };
        if (!body.image || body.image.length < 1000) return json({ error: 'No photo' }, 400);
        if (body.image.length > 7_000_000) return json({ error: 'Photo too large' }, 413);
        return json(await scanCover(body.image, { debug: !!body.debug, upc: body.upc ?? null, knobs: body.debug ? knobsFrom(body.knobs) : DEFAULT_KNOBS }));
      }
      default:
        return json({ error: `unknown op "${op}"` }, 400);
    }
  } catch (e) {
    console.error(op, e);
    return json({ error: (e as Error).message || 'failed' }, 502);
  }
});

type Core = Awaited<ReturnType<typeof locg.comic>>;

/** Community cover photos join the catalogue's variants (never cached with them). */
async function withCustomCovers(core: Core) {
  const custom = await customCoversFor([core.id]);
  if (!custom.length) return core;
  return {
    ...core,
    variants: [
      ...core.variants,
      ...custom.map((c) => ({ id: `custom:${c.id}`, name: c.name, cover: c.image_url, price: null, ratio: null, custom: true, by: c.created_by })),
    ],
  };
}

// ── reviews, scores, credits (Comic Book Roundup) + previous / next ────────
const stars = (score10: number | null | undefined) => (score10 == null ? null : Math.round(score10) / 2);

function cbrLookup(id: string, seriesId: string, publisher: string | null, series: string | null, number: string) {
  return cached(`seriesinfo:${seriesId}`, 30 * DAY, () => locg.seriesInfo(seriesId)).then((info) =>
    cached(
      `cbr:issue:${id}`,
      DAY,
      async () =>
        (await cbrForIssue({ seriesId, publisher: publisher ?? info.publisher, series: series ?? info.title, year: info.startYear, number })) ?? {
          none: true as const,
        },
    ),
  );
}

async function buildExtras(id: string, h: locg.Hint) {
  const t = splitTitle(h.title ?? '');
  if (t.format !== 'issue' || !h.seriesId || !t.number) return {};
  const series = h.series ?? t.series;
  const [cb, nb] = await Promise.all([
    cbrLookup(id, h.seriesId, h.publisher ?? null, series ?? null, t.number).catch(() => null),
    locg.neighbors(h.seriesId, series, t.number).catch(() => ({ prev: null, next: null })),
  ]);
  const out: Record<string, unknown> = { prev: nb.prev, next: nb.next };
  if (cb && !('none' in cb)) {
    Object.assign(out, {
      creators: cb.creators,
      criticScore: cb.criticScore,
      criticCount: cb.criticCount,
      userScore: cb.userScore,
      userCount: cb.userCount,
      rating: stars(cb.userScore ?? cb.criticScore),
      ratingCount: cb.userCount,
      reviewsUrl: cb.url,
      reviews: [
        ...cb.critics.map((r) => ({ source: r.reviewer ?? 'Critic', user: r.outlet ?? r.reviewer ?? 'Critic', rating: stars(r.score), text: r.excerpt ?? '', date: r.date, url: r.url, critic: true })),
        ...cb.users.map((r) => ({ source: 'Comic Book Roundup', user: r.user, avatar: r.avatar, rating: stars(r.score), text: r.text, date: r.date, url: cb.url, critic: false })),
      ],
    });
  }
  return out;
}

// ── auth / limits ───────────────────────────────────────────────────────────
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

// ── cover scans ─────────────────────────────────────────────────────────────
type Lite = locg.Lite;
type Cand = Candidate & { lite: Lite; variantName: string | null };

interface Alt {
  comic: Lite;
  variantId: string | null;
  variantCover: string | null;
  note: string | null;
}

interface ScanResult {
  comic: Lite | null;
  variantId?: string | null;
  variantCover?: string | null;
  note?: string | null;
  confidence?: number;
  matched?: boolean;
  via?: 'barcode' | 'cover';
  alternatives?: Alt[];
  candidates: Lite[];
  read?: Record<string, string | undefined>;
  _debug?: unknown;
}

const hintOf = (l: Lite) => ({ title: l.title, seriesId: l.seriesId, series: l.series, publisher: l.publisher });
const altOf = (c: Cand): Alt => ({ comic: c.lite, variantId: c.main ? null : c.id, variantCover: c.main ? null : c.cover, note: c.main ? null : c.variantName });
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const numOf = (l: Lite) => (l.number && /^\d+$/.test(l.number) ? Number(l.number) : null);

/** Every cover of one issue: main, catalogue variants, community photos. */
async function coversOf(issue: Lite): Promise<Cand[]> {
  const core = await cached(`core:${issue.id}`, 12 * HOUR, () => locg.comic(issue.id, hintOf(issue)));
  const custom = await customCoversFor([issue.id]);
  const base = { issueId: issue.id, lite: issue };
  return [
    { ...base, id: issue.id, name: `${issue.title} — Main cover`, cover: core.cover ?? issue.cover, main: true, variantName: null },
    ...core.variants.map((v) => ({ ...base, id: v.id, name: `${issue.title} — ${v.name}`, cover: v.cover, main: false, variantName: v.name })),
    ...custom.map((c) => customCand(issue, c)),
  ];
}

const customCand = (issue: Lite, c: { id: string; name: string; image_url: string }): Cand => ({
  issueId: issue.id,
  lite: issue,
  id: `custom:${c.id}`,
  name: `${issue.title} — ${c.name} (collector photo)`,
  cover: c.image_url,
  main: false,
  variantName: c.name,
});

/** Main covers of the run, nearest issue numbers first (catches misread numbers). */
async function runMains(issue: Lite, max: number, skipSelf = true): Promise<Cand[]> {
  if (!issue.seriesId) return [];
  const s = await cached(`series2:${issue.seriesId}`, 12 * HOUR, () => locg.series(issue.seriesId!)).catch(() => null);
  if (!s) return [];
  const n = numOf(issue);
  const list = s.issues
    .filter((i) => !skipSelf || i.id !== issue.id)
    .filter((i) => i.cover)
    .map((i) => ({ i, d: n != null && numOf(i) != null ? Math.abs(numOf(i)! - n) : 999 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map(({ i }) => ({ id: i.id, issueId: i.id, lite: i, name: `${i.title} — Main cover`, cover: i.cover, main: true, variantName: null }));
  return list;
}

function readSummary(read: CoverRead) {
  return {
    series: read.series ?? undefined,
    issue: read.issue_number ?? (read.volume_number != null ? `Vol. ${read.volume_number}` : read.subtitle ?? undefined),
    publisher: read.publisher ?? undefined,
    variant: read.variant_hint ?? read.cover_artist ?? undefined,
  };
}

/** Debug-only overrides for experiments (models from the allow-list only). */
function knobsFrom(k: Partial<ScanKnobs> | undefined): ScanKnobs {
  const model = (m: unknown, d: Model): Model => (MODELS.includes(m as Model) ? (m as Model) : d);
  return {
    readModel: model(k?.readModel, DEFAULT_KNOBS.readModel),
    coarseModel: model(k?.coarseModel, DEFAULT_KNOBS.coarseModel),
    fineModel: model(k?.fineModel, DEFAULT_KNOBS.fineModel),
    inline: typeof k?.inline === 'boolean' ? k.inline : DEFAULT_KNOBS.inline,
    chunk: typeof k?.chunk === 'number' && k.chunk >= 8 && k.chunk <= 100 ? Math.round(k.chunk) : DEFAULT_KNOBS.chunk,
    rerankOver: typeof k?.rerankOver === 'number' && k.rerankOver >= 3 && k.rerankOver <= 12 ? Math.round(k.rerankOver) : DEFAULT_KNOBS.rerankOver,
  };
}

const mainOf = async (issue: Lite): Promise<Cand> => (await coversOf(issue))[0];

async function scanCover(image: string, opts: { debug: boolean; upc: string | null; knobs: ScanKnobs }): Promise<ScanResult> {
  const knobs = opts.knobs;
  const dbg: Record<string, unknown> = { knobs };
  const ms: Record<string, number> = {};
  dbg.ms = ms;
  let t = Date.now();
  const lap = (k: string) => {
    ms[k] = Date.now() - t;
    t = Date.now();
  };
  const out = (r: ScanResult): ScanResult => (opts.debug ? { ...r, _debug: dbg } : r);

  // 0) a barcode the phone decoded from this photo → exact, no AI needed
  if (opts.upc) {
    dbg.phoneBarcode = opts.upc;
    const r = await lookupCode(opts.upc).catch(() => null);
    lap('phoneBarcode');
    if (r?.comic) return out({ ...r, via: 'barcode', confidence: 1, matched: true });
  }

  const read = await readCover(image, knobs.readModel);
  lap('read');
  dbg.read = read;
  const readOut = readSummary(read);
  if (!read.is_comic || !read.series) return out({ comic: null, candidates: [], read: readOut, note: 'That doesn’t look like a comic cover' });

  // 1) the barcode printed on the cover → exact issue and cover
  if (read.barcode_digits) {
    const bc = decodeBarcode(read.barcode_digits);
    dbg.coverBarcode = bc;
    if (bc && (bc.kind === 'isbn' || bc.addon)) {
      const r = await lookupCode(read.barcode_digits).catch(() => null);
      lap('coverBarcode');
      if (r?.comic) return out({ ...r, via: 'barcode', confidence: 0.97, matched: true, read: readOut });
    }
  }

  // 2) collected editions
  if (read.format === 'collected_edition' || (!read.issue_number && (read.volume_number != null || !!read.subtitle))) {
    const tr = await scanTrade(read);
    lap('trade');
    if (tr) return out({ ...tr, read: readOut });
  }

  // 3) which issue: the printed number (or, on a virgin/sketch cover, the
  //    reader's best guess) in the best-matching runs; annuals only when printed
  const guess = !read.issue_number && read.likely_issue ? parseQuery(read.likely_issue) : null;
  const number = read.issue_number ?? (guess?.kind === 'issue' ? guess.issue : null);
  const seriesName = !read.issue_number && guess?.kind === 'issue' ? guess.series : read.series;
  const p: ParsedQuery = { ...parseQuery(`${seriesName} #${number ?? ''}`), annual: read.annual || undefined, year: read.year ?? undefined };
  const cards = rankSeries(await cached(`scards:${normalize(p.series)}`, 6 * HOUR, () => locg.seriesCards(p.series)), p);
  dbg.series = cards.slice(0, 4).map((c) => `${c.id} ${c.title} (${c.publisher}, ${c.years})`);
  const issues: Lite[] = [];
  if (number) {
    for (const s of cards.slice(0, 4)) {
      const hit = await cached(`issue:${s.id}:${p.annual ? 'a' : ''}${p.issue}`, 12 * HOUR, async () => (await locg.findIssue(s, p)) ?? { none: true as const });
      if (!('none' in hit)) issues.push(hit);
      if (issues.length >= 2) break;
    }
  }
  dbg.issues = issues.map((i) => `${i.id} ${i.title} (${i.publisher})`);

  let cands: Cand[];
  const primary = issues[0] ?? null;
  if (primary) {
    const own = byHints(await coversOf(primary), [read.variant_hint, read.cover_artist].filter(Boolean).join(' ')) as Cand[];
    // collector photos of the runner-up issue too: a regional edition (FOMO
    // Books) and the US issue are listed separately, and a photo may be on either
    const other = issues[1] ? (await customCoversFor([issues[1].id])).map((c) => customCand(issues[1], c)) : [];
    const near = await runMains(primary, 4);
    cands = [...own, ...other, ...near];
  } else {
    // no number: the run's recent main covers, plus every cover of its newest
    // issues (store-exclusive virgin covers are usually of recent books)
    const best = cards[0];
    if (!best) return out({ comic: null, candidates: [], read: readOut, note: 'Couldn’t find that series' });
    const s = await cached(`series2:${best.id}`, 12 * HOUR, () => locg.series(best.id));
    const recent = s.issues.filter((i) => i.cover).slice(-60).reverse();
    const newest = await Promise.all(recent.slice(0, 3).map((i) => coversOf(i).catch(() => [] as Cand[])));
    const seen = new Set<string>();
    cands = [...newest.flat(), ...recent.map((i) => ({ id: i.id, issueId: i.id, lite: i, name: `${i.title} — Main cover`, cover: i.cover, main: true, variantName: null }))].filter(
      (c) => !seen.has(c.id) && !!seen.add(c.id),
    );
  }
  const withArt = cands.filter((c) => c.cover);
  dbg.candidates = withArt.length;
  dbg.custom = withArt.filter((c) => c.id.startsWith('custom:')).map((c) => c.name);
  lap('candidates');

  // 4) coarse: every candidate as a thumbnail → top 3
  let top: Cand[] = [];
  if (withArt.length <= 3) top = withArt;
  else {
    // split evenly: 61 candidates at chunk 60 → two calls of 31/30, not 60 + 1
    const parts = Math.ceil(withArt.length / knobs.chunk);
    const size = Math.ceil(withArt.length / parts);
    const rounds = await Promise.all(chunk(withArt, size).map((ch) => coarseRank(image, ch, knobs).catch((e) => ({ ranked: [] as Candidate[], reason: String(e) }))));
    dbg.coarse = rounds.map((r) => ({ ranked: r.ranked.map((c) => c.name), reason: r.reason }));
    top = rounds.flatMap((r) => r.ranked) as Cand[];
    if (top.length > knobs.rerankOver) {
      const again = await coarseRank(image, top, knobs).catch(() => null);
      top = (again?.ranked.length ? again.ranked : top.slice(0, 3)) as Cand[];
    }
  }
  lap('coarse');

  // 5) nothing looked right: widen to the rest of the run before giving up
  if (!top.length && primary) {
    const wide = await runMains(primary, 80);
    if (wide.length) {
      const r = await coarseRank(image, wide, knobs).catch(() => null);
      dbg.wide = r && { ranked: r.ranked.map((c) => c.name), reason: r.reason };
      if (r?.ranked.length) {
        // the photo is another issue of the run: bring in that issue's variants too
        const hitIssue = (r.ranked[0] as Cand).lite;
        const theirs = await coversOf(hitIssue);
        const again = theirs.length > 3 ? await coarseRank(image, theirs, knobs).catch(() => null) : { ranked: theirs, reason: '' };
        top = ((again?.ranked.length ? again.ranked : r.ranked) as Cand[]).slice(0, 3);
      }
    }
    lap('wide');
  }

  if (!top.length) {
    // a printed number pins the issue even when this exact cover isn't listed;
    // a guessed one (virgin covers) doesn't — never show a guess as the answer
    const sure = read.issue_number ? primary : null;
    return out({
      comic: sure,
      matched: false,
      confidence: 0.2,
      note: sure ? 'This cover isn’t in the catalogue yet' : 'Couldn’t match this cover',
      alternatives: [],
      candidates: sure ? issues.slice(1) : issues,
      read: readOut,
      via: 'cover',
    });
  }

  // 6) fine: the top picks at full size → the exact cover. Reprints and foils
  //    share the main art, so the main cover of the likeliest issue always competes.
  const lead = top[0] as Cand;
  const leadMain = lead.main ? lead : await mainOf(lead.lite).catch(() => null);
  const finalists = leadMain && !top.some((c) => c.id === leadMain.id) ? [...top, leadMain] : top;
  const f = await fineMatch(image, finalists, knobs).catch((e) => ({ pick: null, confidence: 0, reason: String(e) }));
  lap('fine');
  dbg.fine = { finalists: finalists.map((c) => c.name), pick: f.pick?.name ?? null, confidence: f.confidence, reason: f.reason };
  let chosen = f.pick as Cand | null;
  let confidence = f.confidence;
  let matched = !!chosen && f.confidence >= 0.5;
  if (!matched) {
    // unsure between covers that share the art: the main cover of the likeliest issue
    chosen = (leadMain ?? lead) as Cand;
    confidence = Math.min(0.45, f.confidence || 0.35);
  }
  const pick = chosen!;
  return out({
    comic: pick.lite,
    variantId: pick.main ? null : pick.id,
    variantCover: pick.main ? null : pick.cover,
    note: pick.main ? null : pick.variantName,
    confidence,
    matched,
    via: 'cover',
    alternatives: finalists.filter((c) => c.id !== pick.id).map((c) => altOf(c as Cand)),
    candidates: issues.filter((i) => i.id !== pick.issueId),
    read: readOut,
  });
}

/** Trades: volume number or subtitle ("The Zoo") against the run's collected editions. */
async function scanTrade(read: CoverRead): Promise<ScanResult | null> {
  const q = read.volume_number != null ? `${read.series} vol ${read.volume_number}` : read.series!;
  const res = await cached(`search2:${normalize(q)}`, 6 * HOUR, () => locg.search(q));
  const others = (res.more ?? []).filter((h) => h.kind === 'comic').map((h) => (h as { comic: Lite }).comic);
  if (res.top?.kind === 'comic' && res.top.comic.format === 'collection') return { comic: res.top.comic, candidates: others, confidence: read.confidence, matched: true, via: 'cover' };
  const sid = res.top?.kind === 'series' ? res.top.series.id : res.top?.kind === 'comic' ? res.top.comic.seriesId : null;
  if (!sid) return null;
  const s = await cached(`series2:${sid}`, 12 * HOUR, () => locg.series(sid));
  if (!s.collections.length) return null;
  const want = new Set(`${read.subtitle ?? ''}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const fmtRank = (t: string) => (/deluxe|omnibus|compendium|box set/i.test(t) ? 2 : /\bHC$/i.test(t) ? 1 : 0);
  const scored = s.collections
    .map((c) => {
      const t = splitTitle(c.title);
      const hits = c.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => want.has(w)).length;
      return { c, score: hits + (read.volume_number != null && t.volume === read.volume_number ? 5 : 0) - fmtRank(c.title) * 0.1 };
    })
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score > 0.5) return { comic: scored[0].c, candidates: scored.slice(1, 8).map((x) => x.c), confidence: read.confidence, matched: true, via: 'cover' };
  return { comic: null, candidates: s.collections, note: `${s.title} — which edition?` };
}

// ── barcodes ────────────────────────────────────────────────────────────────
async function lookupCode(raw: string): Promise<ScanResult> {
  const bc = decodeBarcode(raw);
  if (!bc) return { comic: null, candidates: [], note: 'That barcode didn’t read cleanly — try again.' };

  if (bc.kind === 'upc' && bc.addon) {
    const full = `${bc.upc}${bc.addon}`;
    const hit = await cached(`upc:${full}`, 30 * DAY, async () => (await locg.byUpc(full)) ?? { comic: null, candidates: [] });
    if (hit.comic) {
      if ('seriesId' in hit && hit.seriesId) void upcPut({ code: bc.upc, series_id: hit.seriesId as string, source: 'locg' });
      return hit as ScanResult;
    }
    // not in the source yet: fall back to the series we've learned for this UPC
    const learned = await upcGet(bc.upc);
    if (learned?.series_id) {
      const s = await cached(`series2:${learned.series_id}`, 12 * HOUR, () => locg.series(learned.series_id!));
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
      const s = await cached(`series2:${learned.series_id}`, 12 * HOUR, () => locg.series(learned.series_id!));
      return { comic: null, candidates: s.issues.slice(-12).reverse(), note: `${s.title} — which issue?` };
    }
    return { comic: null, candidates: [] };
  }

  // ISBN (collected editions): book title from Open Library / Google Books → search
  const title = await cached(`isbn:${bc.isbn}`, 30 * DAY, () => isbnTitle(bc.isbn).then((t) => t ?? ''));
  if (!title) return { comic: null, candidates: [] };
  const q = bookQuery(title);
  const res = await cached(`search2:${normalize(q)}`, 6 * HOUR, () => locg.search(q));
  const top = res.top && res.top.kind === 'comic' ? res.top.comic : null;
  const more = (res.more ?? []).filter((h) => h.kind === 'comic').map((h) => (h as { comic: Lite }).comic);
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
