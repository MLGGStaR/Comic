// Comic Book Roundup lookups for a comic: find its page (direct URL from
// publisher/series/year/number, else via CBR search), parse scores, credits
// and reviews. Series → CBR path mappings are cached for a month.
import { CBR, cbrIssueUrl, cbrSlug, parseCbrIssue, parseCbrSearch, type CbrIssue } from '../_shared/cbr.ts';
import { cached } from '../_shared/cache.ts';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DAY = 86400e3;

// CBR answers unknown pages with a redirect — treat anything but a straight 200 as a miss
async function get(url: string): Promise<string | null> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'manual' });
  if (r.status !== 200) {
    await r.body?.cancel().catch(() => {});
    return null;
  }
  return await r.text();
}

const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');

async function seriesPath(seriesId: string, publisher: string, series: string, year: number): Promise<string | null> {
  return cached(`cbr:series:${seriesId}`, 30 * DAY, async () => {
    const guess = `/comic-books/reviews/${cbrSlug(publisher)}/${cbrSlug(series)}-(${year})`;
    const direct = await get(`${CBR}${guess}`);
    if (direct && direct.includes(`${guess}/`)) return guess; // a real series page links its issues
    const html = await get(`${CBR}/search-results?keyword=${encodeURIComponent(series)}`);
    if (!html) return null;
    const hits = parseCbrSearch(html).filter((h) => norm(h.title) === norm(series));
    if (!hits.length) return null;
    hits.sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year));
    return hits[0].path;
  });
}

export interface CbrFor {
  seriesId: string;
  publisher: string | null;
  series: string | null;
  year: number | null;
  number: string | null;
}

export async function cbrForIssue(c: CbrFor): Promise<(CbrIssue & { url: string }) | null> {
  if (!c.publisher || !c.series || !c.year || !c.number) return null;
  const direct = cbrIssueUrl({ publisher: c.publisher, series: c.series, year: c.year, number: c.number });
  let html = await get(direct);
  let url = direct;
  if (!html) {
    const path = await seriesPath(c.seriesId, c.publisher, c.series, c.year).catch(() => null);
    if (!path) return null;
    url = `${CBR}${path}/${encodeURIComponent(c.number.toLowerCase())}`;
    html = await get(url);
  }
  if (!html || !html.includes('scrollToCriticTab')) return null;
  return { ...parseCbrIssue(html), url };
}
