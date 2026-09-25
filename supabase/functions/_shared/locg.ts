// League of Comic Geeks — parsers for the `/comic/get_comics` list engine,
// the one endpoint reachable from server IPs. Pure string parsing (no DOM,
// no Deno APIs) so the Edge Function and the vitest suite share it.
import { normalize, type ParsedQuery } from './query.ts';

export const LOCG = 'https://leagueofcomicgeeks.com';

export interface IssueItem {
  id: string;
  parentId: string | null; // main cover's id when this is a variant
  title: string; // base title, without the variant name
  variantName: string | null;
  releaseDate: string | null;
  price: number | null;
  pulls: number | null;
  community: number | null; // LoCG consensus, % positive
  potw: number | null;
  publisher: string | null;
  cover: string | null; // medium
  href: string | null;
  description: string | null; // list view only, truncated
  sku: string | null;
  foc: string | null; // "Sep 28" (no year)
  variantCount: number | null;
}

export interface SeriesCard {
  id: string;
  title: string;
  publisher: string | null;
  years: string | null;
  count: number | null;
  cover: string | null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'", '#183': '·', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };

export function decode(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      const k = e.toLowerCase();
      if (ENTITIES[k] != null) return ENTITIES[k];
      if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
      if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1)));
      return m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export const stripTags = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<[^>]+>/g, ' ');

const num = (s: string | undefined | null) => (s == null || s === '' ? null : Number(s.replace(/,/g, '')));

function money(s: string | null | undefined): number | null {
  const m = (s ?? '').match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

/** Every `li.issue` in a get_comics list (thumbs or list view). */
export function parseIssueItems(html: string): IssueItem[] {
  const starts: number[] = [];
  const re = /<li(?:\s+id="comic-\d+")?\s+class="issue[^"]*"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) starts.push(m.index);
  return starts.map((s, i) => {
    const b = html.slice(s, starts[i + 1] ?? html.length);
    const g = (r: RegExp) => b.match(r)?.[1];
    const id = g(/data-comic="(\d+)"/)!;
    const parent = g(/data-parent="(\d+)"/);
    const sorting = decode(g(/data-sorting="([^"]*)"/));
    const variantName = decode(g(/<span class='variant-name'>([^<]*)<\/span>/)) || null;
    const title = variantName && sorting.endsWith(variantName) ? sorting.slice(0, -variantName.length).trim() : sorting;
    const ts = Number(g(/class="date" data-date="(\d+)"/) ?? 0);
    const desc = g(/<div class="comic-description[^"]*">\s*<p>([\s\S]*?)(?:<a |<\/p>)/);
    return {
      id,
      parentId: parent && parent !== '0' ? parent : null,
      title,
      variantName,
      releaseDate: ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null,
      price: money(g(/class="price">([^<]*)</)),
      pulls: num(g(/data-pulls="(\d*)"/)),
      community: num(g(/data-community="(\d*)"/)),
      potw: num(g(/data-potw="(\d*)"/)),
      publisher: decode(g(/class="publisher color-offset">([^<]*)</)) || null,
      cover: cleanCover(g(/data-src="([^"]+)"/)),
      href: g(/<a href="(\/comic\/[^"]+)"/) ?? null,
      description: desc ? decode(stripTags(desc)).replace(/\s*(?:\.\.\.|…)\s*$/, '…') || null : null,
      sku: decode(g(/comic-diamond-sku">([^<]*)</)) || null,
      foc: decode(g(/class="[^"]*\bfoc\b[^"]*">\s*FOC:\s*([^<]*)</)) || null,
      variantCount: num(g(/variant-toggle"[^>]*>[^0-9<]*(\d+)/)),
    };
  });
}

/** Series cards from a series-grouped list (search_series / search). */
export function parseSeriesCards(html: string): SeriesCard[] {
  const out: SeriesCard[] = [];
  const re = /<li>\s*<div class="cover">([\s\S]*?)<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const b = m[1];
    const id = b.match(/data-id="(\d+)"/)?.[1];
    if (!id) continue;
    const spansBlock = b.match(/text-truncate">([\s\S]*?)<\/div>/)?.[1] ?? '';
    const spans = [...spansBlock.matchAll(/<span class="">([\s\S]*?)<\/span>/g)].map((x) => decode(x[1]).replace(/^·\s*/, ''));
    out.push({
      id,
      title: decode(b.match(/<div class="title color-primary">\s*<a[^>]*>([\s\S]*?)<\/a>/)?.[1]),
      publisher: spans[0] || null,
      years: spans[1] || null,
      count: num(b.match(/count-issues">\s*([\d,]+)/)?.[1]),
      cover: b.match(/data-src="([^"]+)"/)?.[1] ?? null,
    });
  }
  return out;
}

const FORMAT_WORDS: [RegExp, string][] = [
  [/\b(?:TP|TPB|SC)$/i, 'Trade Paperback'],
  [/\bHC$/i, 'Hardcover'],
  [/\bGN$/i, 'Graphic Novel'],
  [/\bOmnibus\b/i, 'Omnibus'],
  [/\bCompendium\b/i, 'Compendium'],
  [/\bBox Set\b/i, 'Box Set'],
];

/** "Absolute Batman #2" → series + number; "… Vol. 1: The Zoo TP" → collection. */
export function splitTitle(title: string) {
  const t = title.trim();
  let formatLabel: string | null = null;
  for (const [re, label] of FORMAT_WORDS) {
    if (re.test(t)) {
      formatLabel = label;
      break;
    }
  }
  const vol = t.match(/\bVol(?:ume)?\.?\s*(\d+)/i);
  if (formatLabel || vol) {
    const series = t
      .replace(/\s+Vol(?:ume)?\.?\s*\d+[\s\S]*$/i, '')
      .replace(/\s+(?:TP|TPB|SC|HC|GN)$/i, '')
      .trim();
    return { series, number: null, format: 'collection' as const, formatLabel: formatLabel ?? 'Collected Edition', volume: vol ? Number(vol[1]) : null };
  }
  const iss = t.match(/^(.*?)\s+#\s*(\S+)/);
  if (iss) return { series: iss[1].trim(), number: iss[2], format: 'issue' as const, formatLabel: null, volume: null };
  return { series: t, number: null, format: 'issue' as const, formatLabel: null, volume: null };
}

/** LoCG serves "/assets/images/no-cover-*.jpg" when it has no art: treat as none. */
export const cleanCover = (u: string | null | undefined): string | null => (u && /^https?:\/\//.test(u) && !/no-cover/.test(u) ? u : null);

const sameNumber = (a: string | null, b: string) => !!a && a.toLowerCase().replace(/^0+(?=\d)/, '') === b.toLowerCase().replace(/^0+(?=\d)/, '');

/** The main-cover issue with exactly this number; annuals only when asked for. */
export function pickIssue(items: IssueItem[], want: { issue: string; annual?: boolean }): IssueItem | null {
  const mains = items.filter((i) => !i.parentId && sameNumber(splitTitle(i.title).number, want.issue));
  const isAnnual = (i: IssueItem) => /\bannual\b/i.test(i.title);
  const pool = mains.filter((i) => isAnnual(i) === !!want.annual);
  return pool[0] ?? null;
}

export const largeCover = (u: string | null) => (u ? u.replace(/\/(?:small|medium|large)-(\d+)/, '/large-$1') : null);
export const mediumCover = (u: string | null) => (u ? u.replace(/\/(?:small|medium|large)-(\d+)/, '/medium-$1') : null);

export interface LiteCtx {
  seriesId?: string | null;
  series?: string | null;
  format?: 'issue' | 'collection';
}

export function toComicLite(it: IssueItem, ctx: LiteCtx = {}) {
  const t = splitTitle(it.title);
  return {
    id: it.id,
    title: it.title,
    series: ctx.series ?? t.series,
    seriesId: ctx.seriesId ?? null,
    number: t.number,
    format: ctx.format ?? t.format,
    formatLabel: t.formatLabel ?? (ctx.format === 'collection' ? 'Collected Edition' : null),
    publisher: it.publisher,
    releaseDate: it.releaseDate,
    cover: it.cover,
    price: it.price,
    pulls: it.pulls,
    rating: null,
    consensus: it.community,
  };
}

// ── ranking series search results ────────────────────────────────────────
const US_PUBLISHERS = /^(DC Comics|Marvel Comics|Image Comics|Dark Horse Comics|BOOM! Studios|IDW Publishing|Dynamite|Oni Press|Titan Comics|Mad Cave Studios|Vault Comics|AfterShock Comics|Archie Comics|Valiant|AHOY Comics|Skybound|Scout Comics|Abrams|Viz Media|Kodansha|Yen Press|Seven Seas|Ablaze|Awa|Zenescope|Humanoids|Magnetic Press|Titan Books|Top Shelf|Fantagraphics|Drawn & Quarterly|First Second|Scholastic)/i;
export const REPRINTERS = /\b(Panini|Urban Comics|FOMO|JBC|OVNI|Devir|Egmont|ECC|Planeta|Eaglemoss|Hachette|Semic|Salvat|Mondadori|RW Edizioni|Dino|Carlsen|Ediciones|Edizioni|Editora|Comics Deluxe|Kamite|Yapi Kredi|Bubble Comics)\b/i;

const normTitle = (s: string) =>
  normalize(s)
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function yearSpan(years: string | null): [number, number] | null {
  const m = (years ?? '').match(/(\d{4})\s*(?:-\s*(\d{4}|Present))?/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? (/present/i.test(m[2]) ? 9999 : Number(m[2])) : a;
  return [a, b];
}

export function rankSeries(cards: SeriesCard[], q: ParsedQuery): SeriesCard[] {
  const want = normTitle(q.series);
  const wantIssue = q.issue ? parseFloat(q.issue) : NaN;
  const scored = cards.map((c, i) => {
    const t = normTitle(c.title);
    let s = 0;
    if (t === want) s += 100;
    else if (t.startsWith(want)) s += 40 - Math.min(20, t.length - want.length);
    else if (t.includes(want)) s += 20;
    else {
      const a = new Set(want.split(' '));
      const hits = t.split(' ').filter((w) => a.has(w)).length;
      s += hits * 6;
    }
    // a title missing any word you typed is a weak match ("alien vs x men" for "x men 97")
    const tw = new Set(t.split(' '));
    if (!want.split(' ').every((w) => tw.has(w))) s -= 30;
    if (c.publisher && US_PUBLISHERS.test(c.publisher)) s += 30;
    if (c.publisher && REPRINTERS.test(c.publisher)) s -= 30;
    const span = yearSpan(c.years);
    if (q.year && span) s += q.year >= span[0] && q.year <= span[1] ? 50 : -20;
    else if (span && span[1] === 9999) s += 15;
    if (c.count) s += Math.log10(c.count + 1) * 5;
    if (!Number.isNaN(wantIssue) && c.count != null && wantIssue > c.count * 1.5 + 5) s -= 40;
    s += (cards.length - i) * 0.1;
    return { c, s };
  });
  return scored.sort((a, b) => b.s - a.s).map((x) => x.c);
}

// ── request builders ──────────────────────────────────────────────────────
export type Fmt = 1 | 2 | 3 | 4 | 5 | 6; // 1 issue, 2 variants/reprints, 3 TP, 4 HC, 5 digital, 6 annual

export function getComicsUrl(params: Record<string, string | number | undefined>, formats: Fmt[] = [], extra: string[] = []): string {
  const q = new URLSearchParams();
  q.set('addons', '1');
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  let s = q.toString();
  for (const f of formats) s += `&format%5B%5D=${f}`;
  for (const e of extra) s += `&${e}`;
  return `${LOCG}/comic/get_comics?${s}`;
}

/** MM/DD/YYYY as LoCG wants it; it snaps any date to that week's Wednesday. */
export const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
