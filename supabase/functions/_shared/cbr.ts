// Comic Book Roundup (comicbookroundup.com): critic + user scores, critic
// reviews (outlet, score, link), user reviews and writer/artist credits.
// Pure string parsing, shared by the Edge Function and the vitest suite.
import { decode } from './locg.ts';

export const CBR = 'https://comicbookroundup.com';

export interface CbrCritic {
  outlet: string | null;
  reviewer: string | null;
  score: number | null; // 0–10
  date: string | null;
  excerpt: string | null;
  url: string | null;
}

export interface CbrUser {
  user: string;
  avatar: string | null;
  score: number | null; // 0–10
  date: string | null;
  text: string;
}

export interface CbrIssue {
  criticScore: number | null;
  criticCount: number | null;
  userScore: number | null;
  userCount: number | null;
  creators: { name: string; role: string }[];
  coverPrice: number | null;
  critics: CbrCritic[];
  users: CbrUser[];
}

// <br> → a ¶ sentinel first (decode() collapses whitespace), then back to \n
const text = (s: string) =>
  decode(s.replace(/<br\s*\/?>/gi, ' ¶ ').replace(/<[^>]+>/g, ' '))
    .replace(/\s*¶\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const score = (s: string | undefined) => (s && /^\s*\d+(\.\d+)?\s*$/.test(s) ? Number(s) : null);
const realDate = (d: string | undefined) => (d && !/Jan 01, 1970/.test(d) ? d.trim() : null);

function ratingBlock(html: string, id: string, until: string): { score: number | null; count: number | null } {
  const b = html.match(new RegExp(`<div id="${id}">([\\s\\S]*?)${until}`))?.[1] ?? '';
  const s = score(b.match(/<span>([^<]+)<\/span>/)?.[1]);
  const c = b.match(/class="review-count">\s*(\d+) Reviews?/)?.[1];
  return { score: s, count: s == null ? null : Number(c ?? 0) };
}

export function parseCbrIssue(html: string): CbrIssue {
  const critic = ratingBlock(html, 'scrollToCriticTab', '<div id="scrollToUserTab">');
  const user = ratingBlock(html, 'scrollToUserTab', '</a>|<table');

  const info: Record<string, string> = {};
  for (const m of html.matchAll(/<tr>\s*<td>([^<]+)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)) info[m[1].trim()] = text(m[2]);
  const creators: { name: string; role: string }[] = [];
  for (const role of ['Writer', 'Artist', 'Penciller', 'Inker', 'Colorist', 'Cover Artist', 'Letterer']) {
    for (const name of (info[role] ?? '').split(/\s*,\s*|\s+&\s+/).filter(Boolean)) creators.push({ name, role });
  }

  const criticBlock = html.match(/<div id="reviews-critic"[\s\S]*?<ul>([\s\S]*?)<\/ul>/)?.[1] ?? '';
  const critics = [...criticBlock.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, li]) => {
    const h3 = li.match(/<h3>([\s\S]*?)\s*-\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/);
    const p = li.match(/<p>([\s\S]*?)<a href="([^"]+)"[^>]*>Read Full Review<\/a>/);
    return {
      outlet: h3 ? text(h3[1]) : null,
      reviewer: h3 ? text(h3[3]) : null,
      score: score(li.match(/<div class="review[^"]*"><span>([\d.]+)<\/span>/)?.[1]),
      date: realDate(li.match(/<span class="date">([^<]+)<\/span>/)?.[1]),
      excerpt: p ? text(p[1]) || null : null,
      url: p ? decode(p[2]) : null,
    };
  });

  // each user review nests its own lists (likes popup, comments), so split on
  // the review-item boundary instead of matching the whole <ul>
  const start = html.indexOf('<ul id="reviews">', html.indexOf('id="reviews-user"'));
  const chunks = start < 0 ? [] : html.slice(start).split(/<li>\s*<div class="list-review">/).slice(1);
  const users: CbrUser[] = [];
  for (const li of chunks) {
    const name = li.match(/<h3><a[^>]*>([^<]+)<\/a><\/h3>/)?.[1];
    if (!name) continue;
    const p = li.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '';
    const body = p.replace(/<span id="review-more"[^>]*>([\s\S]*?)<\/span>/, '$1').replace(/<a class='event-more-link'>more<\/a>/, '');
    users.push({
      user: decode(name),
      avatar: li.match(/<img src='([^']+)'/)?.[1] ?? null,
      score: score(li.match(/<div class="review user[^"]*"><span>([\d.]+)<\/span>/)?.[1]),
      date: realDate(li.match(/<span class="date">([^<]+)<\/span>/)?.[1]),
      text: text(body),
    });
  }

  const price = (info['Cover Price'] ?? '').match(/\$\s*([\d.]+)/)?.[1];
  return {
    criticScore: critic.score,
    criticCount: critic.count,
    userScore: user.score,
    userCount: user.count,
    creators,
    coverPrice: price ? Number(price) : null,
    critics,
    users,
  };
}

/** Series links on a CBR search results page. */
export function parseCbrSearch(html: string): { path: string; title: string; year: number }[] {
  const out: { path: string; title: string; year: number }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/href="(\/comic-books\/reviews\/[a-z0-9-]+\/[^"/]+-\((\d{4})\))"[^>]*>([^<]*)</g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ path: m[1], year: Number(m[2]), title: decode(m[3]).replace(/\s*\(\d{4}\)\s*$/, '') });
  }
  return out;
}

export function cbrSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function cbrIssueUrl(c: { publisher: string; series: string; year: number; number: string }): string {
  return `${CBR}/comic-books/reviews/${cbrSlug(c.publisher)}/${cbrSlug(c.series)}-(${c.year})/${encodeURIComponent(c.number.toLowerCase())}`;
}
