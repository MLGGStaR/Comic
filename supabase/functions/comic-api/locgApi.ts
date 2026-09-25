// League of Comic Geeks through its list engine: search, series, weeks,
// comic detail (list view + variants) and barcode lookup. Every call is
// cached upstream of here (see index.ts) — keep request volume low.
import {
  getComicsUrl,
  parseIssueItems,
  parseSeriesCards,
  rankSeries,
  splitTitle,
  toComicLite,
  largeCover,
  stripTags,
  decode,
  usDate,
  REPRINTERS,
  type Fmt,
  type IssueItem,
  type SeriesCard,
} from '../_shared/locg.ts';
import { normalize, parseQuery, type ParsedQuery } from '../_shared/query.ts';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface ListResponse {
  list?: string;
  count?: number;
  series?: { title?: string; publisher_name?: string; description?: string };
  configurator?: { extendable?: number | string };
}

async function getComics(url: string): Promise<ListResponse> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://leagueofcomicgeeks.com/',
    },
  });
  if (!r.ok) throw new Error(`Comic data source returned ${r.status}`);
  const text = await r.text();
  if (text.startsWith('<')) throw new Error('Comic data source is blocking requests right now');
  return JSON.parse(text) as ListResponse;
}

/** Follow list pagination (only ever needed for very long lists). */
async function getAllItems(url: string, maxPages = 8): Promise<{ items: IssueItem[]; first: ListResponse }> {
  const first = await getComics(url);
  const items = parseIssueItems(first.list ?? '');
  let res = first;
  let page = 1;
  while (String(res.configurator?.extendable ?? '0') === '1' && page < maxPages) {
    const offset = (res.list ?? '').match(/data-list-offset="(\d+)"/)?.[1];
    if (!offset) break;
    res = await getComics(`${url}&list_mode_offset=${offset}&list_extend=1`);
    const more = parseIssueItems(res.list ?? '');
    if (!more.length) break;
    items.push(...more);
    page++;
  }
  return { items, first };
}

export type Lite = ReturnType<typeof toComicLite>;

export interface SeriesHit {
  id: string;
  title: string;
  publisher: string | null;
  years: string | null;
  cover: string | null;
  count?: number | null;
}

const seriesHit = (c: SeriesCard): SeriesHit => ({ id: c.id, title: c.title, publisher: c.publisher, years: c.years, cover: c.cover, count: c.count });
const isMain = (i: IssueItem) => !i.parentId;
const sameNum = (a: string | null, b: string | undefined) => !!a && !!b && a.toLowerCase().replace(/^0+(?=\d)/, '') === b.toLowerCase().replace(/^0+(?=\d)/, '');

export async function searchSeries(title: string): Promise<SeriesCard[]> {
  const j = await getComics(getComicsUrl({ list: 'search_series', list_option: 'series', view: 'thumbs', title, series_id: 0, user_id: 0 }));
  return parseSeriesCards(j.list ?? '');
}

export async function seriesItems(seriesId: string, formats: Fmt[]): Promise<{ items: IssueItem[]; info: ListResponse['series'] }> {
  const { items, first } = await getAllItems(getComicsUrl({ list: 'series', list_option: '', series_id: seriesId, view: 'thumbs', order: 'date-asc' }, formats));
  return { items, info: first.series };
}

async function inSeries(seriesId: string, title: string, formats: Fmt[], view: 'thumbs' | 'list' = 'thumbs') {
  const j = await getComics(getComicsUrl({ list: 'search', list_option: '', series_id: seriesId, view, title }, formats));
  return { items: parseIssueItems(j.list ?? ''), info: j.series };
}

// ── search ──────────────────────────────────────────────────────────────
const flat = (s: string) => normalize(s).replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Series search that retries spelling variants LoCG needs ("x-men 97" →
 *  "x-men '97") until some series title actually starts with what was typed. */
async function seriesCards(title: string): Promise<SeriesCard[]> {
  const want = flat(title);
  const tries = [title];
  const apos = title.replace(/(^|\s)(\d{2})(?=\s|$)/g, "$1'$2");
  if (apos !== title) tries.push(apos);
  const dehyphen = title.replace(/-/g, ' ');
  if (dehyphen !== title) tries.push(dehyphen);
  const all: SeriesCard[] = [];
  for (const t of tries) {
    const cards = await searchSeries(t);
    for (const c of cards) if (!all.some((x) => x.id === c.id)) all.push(c);
    if (cards.some((c) => flat(c.title) === want || flat(c.title).startsWith(`${want} `))) break;
  }
  return all;
}

export async function search(q: string) {
  const p = parseQuery(q);
  let cards = await seriesCards(p.series);
  if (!cards.length && p.kind !== 'series') {
    // maybe the whole query is the title (e.g. "x-men 97")
    cards = await searchSeries(normalize(q));
    if (cards.length) return seriesResult(rankSeries(cards, { ...parseQuery(normalize(q)), kind: 'series' }));
  }
  if (!cards.length) return { top: null, more: [] };
  const ranked = rankSeries(cards, p);
  if (p.kind === 'series') return seriesResult(ranked);

  const best = ranked[0];
  const others = ranked.slice(1, 5).map((c) => ({ kind: 'series' as const, series: seriesHit(c) }));
  const seriesItself = { kind: 'series' as const, series: seriesHit(best) };

  if (p.kind === 'issue') {
    const hit = await findIssue(best, p);
    if (hit) return { top: { kind: 'comic' as const, comic: hit }, more: [seriesItself, ...others] };
    return { top: seriesItself, more: others };
  }
  const cols = await findCollections(best, p);
  if (cols.length) {
    return {
      top: { kind: 'comic' as const, comic: cols[0] },
      more: [...cols.slice(1, 4).map((c) => ({ kind: 'comic' as const, comic: c })), seriesItself, ...others].slice(0, 6),
    };
  }
  return { top: seriesItself, more: others };
}

function seriesResult(ranked: SeriesCard[]) {
  return { top: { kind: 'series' as const, series: seriesHit(ranked[0]) }, more: ranked.slice(1, 6).map((c) => ({ kind: 'series' as const, series: seriesHit(c) })) };
}

async function findIssue(best: SeriesCard, p: ParsedQuery): Promise<Lite | null> {
  const ctx = { seriesId: best.id, series: best.title, format: 'issue' as const };
  const { items } = await inSeries(best.id, `${best.title} #${p.issue}`, [1, 6]);
  let hit = items.filter(isMain).find((i) => sameNum(splitTitle(i.title).number, p.issue));
  if (!hit) {
    const all = await seriesItems(best.id, [1, 6]);
    hit = all.items.filter(isMain).find((i) => sameNum(splitTitle(i.title).number, p.issue));
  }
  return hit ? toComicLite(hit, ctx) : null;
}

async function findCollections(best: SeriesCard, p: ParsedQuery): Promise<Lite[]> {
  const ctx = { seriesId: best.id, series: best.title, format: 'collection' as const };
  const pick = (items: IssueItem[]) =>
    items
      .filter(isMain)
      .filter((i) => p.volume == null || splitTitle(i.title).volume === p.volume)
      .map((i) => toComicLite(i, ctx))
      // plain TP first, then HC, then deluxe/omnibus editions
      .sort((a, b) => rankFormat(a.title) - rankFormat(b.title) || (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''));
  let found = pick((await inSeries(best.id, `${best.title} vol ${p.volume ?? ''}`.trim(), [3, 4])).items);
  if (!found.length) found = pick((await seriesItems(best.id, [3, 4])).items);
  return found;
}

function rankFormat(title: string): number {
  if (/deluxe|omnibus|compendium|absolute edition|box set/i.test(title)) return 3;
  if (/\bHC$/i.test(title)) return 2;
  return 1;
}

/** Title, publisher and start year of a run (cheap: first page + the series card). */
export async function seriesInfo(id: string) {
  const j = await getComics(getComicsUrl({ list: 'series', list_option: '', series_id: id, view: 'thumbs', order: 'date-asc' }, [1, 6]));
  const items = parseIssueItems(j.list ?? '').filter(isMain);
  const title = decode(j.series?.title ?? '') || splitTitle(items[0]?.title ?? '').series;
  // the series card's "1963 - 1998" beats issue dates (old issues are often undated)
  const card = title ? (await searchSeries(title).catch(() => [] as SeriesCard[])).find((c) => c.id === id) : undefined;
  const cardYear = Number(card?.years?.match(/\d{4}/)?.[0] ?? 0) || null;
  const firstDate = items.map((i) => i.releaseDate).filter(Boolean).sort()[0] ?? null;
  return {
    id,
    title,
    publisher: j.series?.publisher_name ?? items[0]?.publisher ?? null,
    years: card?.years ?? null,
    startYear: cardYear ?? (firstDate ? Number(firstDate.slice(0, 4)) : null),
  };
}

// ── series page ─────────────────────────────────────────────────────────
export async function series(id: string) {
  const [iss, col] = await Promise.all([seriesItems(id, [1, 6]), seriesItems(id, [3, 4])]);
  const info = iss.info ?? col.info ?? {};
  const title = decode(info.title ?? '') || splitTitle(iss.items[0]?.title ?? col.items[0]?.title ?? '').series;
  const ctx = (format: 'issue' | 'collection') => ({ seriesId: id, series: title, format });
  const issues = iss.items.filter(isMain).map((i) => toComicLite(i, ctx('issue')));
  const collections = col.items.filter(isMain).map((i) => toComicLite(i, ctx('collection')));
  const dates = issues.map((i) => i.releaseDate).filter(Boolean).sort() as string[];
  const last = dates[dates.length - 1];
  const ongoing = last && Date.parse(last) > Date.now() - 120 * 86400e3;
  return {
    id,
    title,
    publisher: info.publisher_name ?? issues[0]?.publisher ?? null,
    years: dates.length ? `${dates[0].slice(0, 4)} – ${ongoing ? 'Present' : last!.slice(0, 4)}` : null,
    cover: issues[0]?.cover ?? collections[0]?.cover ?? null,
    description: info.description ? decode(stripTags(info.description)) : null,
    issues,
    collections,
    url: `https://leagueofcomicgeeks.com/comics/series/${id}`,
  };
}

// ── weekly releases ─────────────────────────────────────────────────────
const NOISE = ['publisher_exclude%5B%5D=1044', 'publisher_exclude%5B%5D=400']; // Webtoon, Shueisha digital chapters

export async function week(dateIso: string) {
  const base = { list: 'releases', list_option: '', date_type: 'week', date: usDate(dateIso), view: 'thumbs', order: 'pulls' };
  const [iss, col] = await Promise.all([
    getAllItems(getComicsUrl(base, [1, 6], NOISE), 4),
    getAllItems(getComicsUrl(base, [3, 4], NOISE), 4),
  ]);
  const seen = new Set<string>();
  const out: Lite[] = [];
  for (const [items, format] of [
    [iss.items, 'issue'],
    [col.items, 'collection'],
  ] as const) {
    for (const it of items) {
      if (!isMain(it) || seen.has(it.id)) continue;
      // $0.00 = digital chapters (manga, webtoons) — except Free Comic Book Day books
      if (it.price === 0 && !/free comic book day|\bfcbd\b/i.test(it.title)) continue;
      // foreign-language reprint editions of US books
      if (it.publisher && REPRINTERS.test(it.publisher)) continue;
      seen.add(it.id);
      out.push(toComicLite(it, { format }));
    }
  }
  return out;
}

// ── one comic, with every cover variant ─────────────────────────────────
export interface Hint {
  title?: string | null;
  seriesId?: string | null;
  series?: string | null;
  publisher?: string | null;
}

async function resolveSeries(title: string, publisher?: string | null): Promise<SeriesCard | null> {
  const t = splitTitle(title);
  const cards = await searchSeries(t.series);
  if (!cards.length) return null;
  const q = parseQuery(t.number ? `${t.series} #${t.number}` : t.series);
  const ranked = rankSeries(publisher ? cards.filter((c) => c.publisher === publisher).concat(cards.filter((c) => c.publisher !== publisher)) : cards, q);
  return ranked[0];
}

export async function comic(id: string, hint: Hint) {
  let seriesId = hint.seriesId ?? null;
  let seriesTitle = hint.series ?? null;
  const title = hint.title ?? null;
  if (!title) throw new Error('Missing comic title');
  if (!seriesId) {
    const s = await resolveSeries(title, hint.publisher);
    if (!s) throw new Error('Couldn’t find this comic’s series');
    seriesId = s.id;
    seriesTitle = s.title;
  }
  const baseTitle = title;
  const { items, info } = await inSeries(seriesId, baseTitle, [], 'list');
  const self = items.find((i) => i.id === id);
  const mainId = self?.parentId ?? id;
  let main = items.find((i) => i.id === mainId);
  let family = items;
  if (!main) {
    // the text search can miss; fall back to the whole run
    const all = await seriesItems(seriesId, [1, 6, 3, 4]);
    main = all.items.find((i) => i.id === mainId);
    if (!main) throw new Error('Comic not found');
    family = (await inSeries(seriesId, main.title, [], 'list')).items;
  }
  seriesTitle = seriesTitle || decode(info?.title ?? '') || splitTitle(main.title).series;
  const t = splitTitle(main.title);
  const lite = toComicLite(main, { seriesId, series: seriesTitle, format: t.format });
  // Cover B, C, D… first; later printings / reprints last
  const printRank = (n: string) => (/\b(\d+(st|nd|rd|th) print(ing)?|printing|reprint)\b/i.test(n) ? 1 : 0);
  const letter = (n: string) => n.match(/\bCover ([A-Z]{1,2})\b/)?.[1] ?? 'ZZ';
  const variants = family
    .filter((i) => i.parentId === main!.id)
    .map((v) => ({
      id: v.id,
      name: v.variantName ?? v.title,
      cover: v.cover,
      price: v.price,
      ratio: (v.variantName ?? '').match(/\b1\s*:\s*\d+\b/)?.[0]?.replace(/\s/g, '') ?? null,
    }))
    .sort((a, b) => printRank(a.name) - printRank(b.name) || letter(a.name).localeCompare(letter(b.name)) || a.name.localeCompare(b.name));

  // previous / next issue: two small in-series lookups (never the whole run)
  let prev: Lite | null = null;
  let next: Lite | null = null;
  const n = t.number != null && /^\d+$/.test(t.number) ? Number(t.number) : null;
  if (t.format === 'issue' && n != null) {
    const ctx = { seriesId, series: seriesTitle, format: 'issue' as const };
    const find = async (k: number) => {
      if (k < 0) return null;
      const r = await inSeries(seriesId!, `${seriesTitle} #${k}`, [1]).catch(() => null);
      const hit = r?.items.filter(isMain).find((x) => sameNum(splitTitle(x.title).number, String(k)));
      return hit ? toComicLite(hit, ctx) : null;
    };
    [prev, next] = await Promise.all([find(n - 1), find(n + 1)]);
  }

  return {
    ...lite,
    cover: largeCover(main.cover),
    description: main.description,
    creators: [] as { name: string; role: string }[],
    pages: null,
    upc: null,
    isbn: null,
    focDate: null,
    sku: main.sku,
    foc: main.foc,
    variants,
    reviews: [] as unknown[],
    ratingCount: null,
    criticScore: null,
    criticCount: null,
    prev,
    next,
    url: `https://leagueofcomicgeeks.com/comic/${main.id}`,
  };
}

// ── barcode ─────────────────────────────────────────────────────────────
/** Full 17-digit UPC (main + add-on) → the exact issue or variant. */
export async function byUpc(upc17: string) {
  const cards = await getComics(getComicsUrl({ list: 'search', list_option: 'series', view: 'thumbs', title: upc17, series_id: 0, user_id: 0 })).then((j) =>
    parseSeriesCards(j.list ?? ''),
  );
  for (const card of cards.slice(0, 3)) {
    const { items } = await inSeries(card.id, upc17, []);
    const hit = items[0];
    if (!hit) continue;
    const mainId = hit.parentId ?? hit.id;
    const fam = await inSeries(card.id, hit.title, []);
    const main = fam.items.find((i) => i.id === mainId) ?? (hit.parentId ? null : hit);
    if (!main) continue;
    const t = splitTitle(main.title);
    const comic = toComicLite(main, { seriesId: card.id, series: card.title, format: t.format });
    const variant = hit.parentId ? hit : null;
    return {
      comic,
      seriesId: card.id,
      variantId: variant?.id ?? null,
      variantCover: variant?.cover ?? null,
      note: variant?.variantName ?? null,
      candidates: [] as Lite[],
    };
  }
  return null;
}
