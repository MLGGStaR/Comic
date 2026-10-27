// Data audit (read-only).
//  A. Release dates: for every comic LoCG lists over a span of weeks, the date
//     the app derives (data-date timestamp) must equal the date LoCG prints
//     next to it, and the comic must sit in the week its date says.
//  B. A user's library: each stored snapshot (title, number, release date,
//     price, cover, publisher, format) against LoCG's data today.
// usage: npx vite-node scripts/data-audit.mjs [username] [--weeks-back 2] [--weeks-ahead 12]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseIssueItems, getComicsUrl, usDate } from '../supabase/functions/_shared/locg.ts';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const who = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'MLGGStaR';
const BACK = arg('--weeks-back', 2);
const AHEAD = arg('--weeks-ahead', 12);

// LoCG answers curl but not Node's fetch (client fingerprint)
const locg = (url) =>
  JSON.parse(
    execFileSync('curl', ['-s', '-A', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', '-H', 'Accept: application/json', '-H', 'X-Requested-With: XMLHttpRequest', '-H', 'Referer: https://leagueofcomicgeeks.com/', url], {
      encoding: 'utf8',
      maxBuffer: 64 << 20,
    }),
  );

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** "Jul 9th, 2025" → "2025-07-09" */
const printed = (s) => {
  const m = s.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
};
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);

// ── A. dates as LoCG prints them ──────────────────────────────────────────
const wed = new Date();
wed.setUTCDate(wed.getUTCDate() + ((3 - wed.getUTCDay() + 7) % 7));
let checked = 0;
let dateMismatch = [];
let weekMismatch = [];
let undated = 0;
const future = [];
for (let w = -BACK; w <= AHEAD; w++) {
  const d = new Date(wed.getTime() + w * 7 * 86400000).toISOString().slice(0, 10);
  let n = 0;
  for (const formats of [[1, 6], [3, 4]]) {
    let url = getComicsUrl({ list: 'releases', list_option: '', date_type: 'week', date: usDate(d), view: 'thumbs', order: 'pulls' }, formats);
    for (let page = 0; page < 6; page++) {
      const res = locg(url);
      const html = res.list ?? '';
      const items = parseIssueItems(html);
      // the printed date next to each comic, by id
      const shown = new Map();
      for (const m of html.matchAll(/data-comic="(\d+)"[\s\S]*?class="date" data-date="\d+">([^<]*)</g)) shown.set(m[1], printed(m[2]));
      for (const it of items) {
        n++;
        checked++;
        if (!it.releaseDate) {
          undated++;
          continue;
        }
        const p = shown.get(it.id);
        if (p && p !== it.releaseDate) dateMismatch.push(`${it.title} — app ${it.releaseDate}, LoCG shows ${p}`);
        if (Math.abs(dayDiff(it.releaseDate, d)) > 6) weekMismatch.push(`${it.title} — ${it.releaseDate} listed in week of ${d}`);
        if (it.releaseDate > new Date().toISOString().slice(0, 10)) future.push(it);
      }
      if (String(res.configurator?.extendable ?? '0') !== '1') break;
      const offset = html.match(/data-list-offset="(\d+)"/)?.[1];
      if (!offset) break;
      url = `${getComicsUrl({ list: 'releases', list_option: '', date_type: 'week', date: usDate(d), view: 'thumbs', order: 'pulls' }, formats)}&list_mode_offset=${offset}&list_extend=1`;
    }
  }
  console.log(`week of ${d}: ${n} listings`);
}
console.log(`\nA. ${checked} listings over ${BACK + AHEAD + 1} weeks (${future.length} future): ${dateMismatch.length} date mismatches, ${weekMismatch.length} outside their week, ${undated} undated`);
for (const x of [...dateMismatch, ...weekMismatch].slice(0, 20)) console.log('   ', x);
const wd = {};
for (const it of future) {
  const day = new Date(`${it.releaseDate}T12:00:00Z`).getUTCDay();
  wd[day] = (wd[day] ?? 0) + 1;
}
console.log('   future release weekdays (0=Sun … 3=Wed):', JSON.stringify(wd));

// ── B. the user's library vs LoCG today ───────────────────────────────────
const cfg = JSON.parse(fs.readFileSync('C:/Users/S0000005749/Desktop/LetterSizd/web-deploy.json', 'utf8'));
const BASE = 'https://fotppunwikhxhvzzlgfy.supabase.co';
const H = { apikey: cfg.supabaseServiceKey, Authorization: `Bearer ${cfg.supabaseServiceKey}` };
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvdHBwdW53aWtoeGh2enpsZ2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3OTQ2MDIsImV4cCI6MjEwMDM3MDYwMn0.XhR8V1VN4ffxqiShq2g5NOgx9DL9N1lstznNMlqFM3E';
const [prof] = await (await fetch(`${BASE}/rest/v1/profiles?select=id&username=eq.${encodeURIComponent(who)}`, { headers: H })).json();
const rows = await (await fetch(`${BASE}/rest/v1/comic_entries?select=comic_id,owned,read,wishlist,meta,updated_at&user_id=eq.${prof.id}`, { headers: H })).json();
const today = new Date().toISOString().slice(0, 10);
const diffs = [];
let futureEntries = 0;
for (const r of rows) {
  const m = r.meta;
  const soon = !m.releaseDate || m.releaseDate >= new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  if (m.releaseDate > today) futureEntries++;
  const p = new URLSearchParams({ op: 'comic', id: m.id, title: m.title ?? '', seriesId: m.seriesId ?? '', series: m.series ?? '', publisher: m.publisher ?? '', ...(soon ? { fresh: '1' } : {}) });
  const d = await (await fetch(`${BASE}/functions/v1/comic-api?${p}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })).json();
  if (d.error) {
    diffs.push(`${m.title}: LoCG lookup failed (${d.error})`);
    continue;
  }
  const strip = (u) => (u ?? '').replace(/\?.*$/, '').replace(/\/(?:small|medium|large)-/, '/x-');
  const f = [];
  for (const k of ['title', 'number', 'releaseDate', 'price', 'publisher', 'format']) if ((m[k] ?? null) !== (d[k] ?? null)) f.push(`${k}: stored ${JSON.stringify(m[k] ?? null)} → now ${JSON.stringify(d[k] ?? null)}`);
  if (strip(m.cover) !== strip(d.cover)) f.push('cover image changed');
  if (f.length) diffs.push(`${r.wishlist ? '[wish] ' : r.owned ? '[own]  ' : '[read] '}${m.title}${m.releaseDate > today ? ' (upcoming)' : ''}\n      ${f.join('\n      ')}`);
}
console.log(`\nB. ${who}: ${rows.length} comics (${futureEntries} upcoming) — ${diffs.length} differ from LoCG today`);
for (const x of diffs) console.log('   ', x);
