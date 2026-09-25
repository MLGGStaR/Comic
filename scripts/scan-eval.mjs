// Cover-scan accuracy evaluation. Builds a labelled set of real covers
// (main + variants of popular issues, older keys, FOMO editions), renders each
// as a phone-style photo (angle, glare, background, blur), runs the live scan
// and scores issue-level and cover-level accuracy. Report → scripts/smoke-out/scan-eval.json
// usage: node scripts/scan-eval.mjs [--quick] [--reuse] [--only <text>] [--knobs '{"coarseModel":"claude-sonnet-5"}'] [--tag name]
//   --reuse  keep photos rendered by an earlier run   --only  cases whose label contains <text>
//   --knobs  per-pass model / inline overrides (debug only)   --tag  report name suffix
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const cfg = JSON.parse(fs.readFileSync('C:/Users/S0000005749/Desktop/LetterSizd/web-deploy.json', 'utf8'));
const BASE = 'https://fotppunwikhxhvzzlgfy.supabase.co';
const FN = `${BASE}/functions/v1/comic-api`;
const SVC = cfg.supabaseServiceKey;
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvdHBwdW53aWtoeGh2enpsZ2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3OTQ2MDIsImV4cCI6MjEwMDM3MDYwMn0.XhR8V1VN4ffxqiShq2g5NOgx9DL9N1lstznNMlqFM3E';
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };
const OUT = path.resolve('scripts/smoke-out/scan-eval');
fs.mkdirSync(OUT, { recursive: true });
const quick = process.argv.includes('--quick');
const reuse = process.argv.includes('--reuse');
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const only = arg('--only')?.toLowerCase() ?? null;
const knobs = arg('--knobs') ? JSON.parse(arg('--knobs')) : undefined;
const reportTag = arg('--tag') ?? '';

const api = async (params) =>
  (await fetch(`${FN}?${new URLSearchParams(params)}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })).json();

// ── 1) labelled cases ─────────────────────────────────────────────────────
const SEEDS = [
  ['absolute batman #1', 2],
  ['absolute batman #24', 2],
  ['absolute wonder woman #1', 1],
  ['amazing spider-man #1000', 1],
  ['ultimate spider-man #1', 1],
  ['saga #1', 0],
  ['amazing spider-man #300', 0],
  ['batman #50', 0],
  ['transformers #1', 1],
  ['something is killing the children #1', 0],
  ['x-men #1', 1],
  ['spawn #1', 0],
];
const cases = [];
for (const [q, nVariants] of quick ? SEEDS.slice(0, 4) : SEEDS) {
  const s = await api({ op: 'search', q });
  const top = s.top?.kind === 'comic' ? s.top.comic : null;
  if (!top) {
    console.log('seed miss', q);
    continue;
  }
  cases.push({ label: `${top.title} (main)`, coverId: top.id, expectIssue: top.id, expectVariant: null });
  if (!nVariants) continue;
  const d = await api({ op: 'comic', id: top.id, title: top.title, seriesId: top.seriesId ?? '', series: top.series ?? '', publisher: top.publisher ?? '' });
  const vs = (d.variants ?? []).filter((v) => v.cover && !/print|reprint|blank/i.test(v.name));
  const picks = [vs[1], vs[Math.min(vs.length - 1, 4)]].filter(Boolean).slice(0, nVariants);
  for (const v of picks) cases.push({ label: `${top.title} — ${v.name}`, coverId: v.id, expectIssue: top.id, expectVariant: v.id });
}
// FOMO Books (Dubai) editions: LoCG reuses the DC cover image for them, so a
// photo can only ever resolve to the DC issue OR the FOMO entry — both count.
for (const [id, t, dcIssueQ] of [
  ['5840019', 'Absolute Batman #1 (FOMO Books)', 'absolute batman #1'],
  ['4964389', 'Absolute Batman #2 (FOMO Books)', 'absolute batman #2'],
  ['2213701', 'Absolute Batman #20 (FOMO Books)', 'absolute batman #20'],
]) {
  if (quick) continue;
  const s = await api({ op: 'search', q: dcIssueQ });
  const dc = s.top?.kind === 'comic' ? s.top.comic.id : null;
  cases.push({ label: t, coverId: id, expectIssue: id, alsoIssue: dc, expectVariant: null });
}
if (only) cases.splice(0, cases.length, ...cases.filter((c) => only.split('|').some((o) => c.label.toLowerCase().includes(o))));
console.log(`${cases.length} cases${knobs ? ` · knobs ${JSON.stringify(knobs)}` : ''}`);

// ── 2) phone-style photos ─────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
const rnd = (i, k) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
for (const [i, c] of cases.entries()) {
  c.photo = path.join(OUT, `cover-${c.coverId}.jpg`);
  if (reuse && fs.existsSync(c.photo)) continue;
  const rz = (rnd(i, 1) - 0.5) * 16;
  const ry = (rnd(i, 2) - 0.5) * 24;
  const rx = (rnd(i, 3) - 0.5) * 16;
  const w = 470 + rnd(i, 4) * 170;
  const bg = ['#6b5a48', '#2f3a44', '#8a8f96', '#4b3b2a', '#20242b'][i % 5];
  const glare = 20 + rnd(i, 5) * 60;
  const blur = rnd(i, 6) > 0.6 ? 0.8 : 0;
  const bright = 0.85 + rnd(i, 7) * 0.25;
  await page.setContent(`<body style="margin:0;background:${bg};display:flex;align-items:center;justify-content:center;height:100vh;perspective:1400px;overflow:hidden">
    <div style="transform:rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg);box-shadow:0 30px 60px rgba(0,0,0,.6);position:relative">
      <img src="https://s3.amazonaws.com/comicgeeks/comics/covers/large-${c.coverId}.jpg" style="width:${w}px;display:block;filter:brightness(${bright}) contrast(.93) blur(${blur}px)">
      <div style="position:absolute;inset:0;background:linear-gradient(115deg,transparent ${glare - 10}%,rgba(255,255,255,.33) ${glare}%,transparent ${glare + 10}%)"></div>
    </div></body>`);
  await page.waitForFunction(() => document.images[0]?.complete, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: c.photo, type: 'jpeg', quality: 80 });
}
await browser.close();

// ── 3) run the live scan as a signed-in throwaway user ────────────────────
const tag = Date.now().toString().slice(-6);
const email = `eval+${tag}@longbox.test`;
const password = `Eval-${tag}-Aa1!x`;
const user = await (await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username: `eval${tag}` } }) })).json();
const results = [];
try {
  const tok = await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  const run = async (c) => {
    const t0 = Date.now();
    const r = await fetch(`${FN}?op=scan`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: fs.readFileSync(c.photo).toString('base64'), debug: true, knobs }),
    });
    const j = await r.json().catch(() => ({}));
    const gotIssue = j.comic?.id ?? null;
    const gotVariant = j.variantId ?? null;
    const issueOk = gotIssue === c.expectIssue || (!!c.alsoIssue && gotIssue === c.alsoIssue);
    const coverOk = issueOk && gotVariant === c.expectVariant;
    const row = { ...c, ms: Date.now() - t0, status: r.status, gotIssue, gotTitle: j.comic?.title ?? null, gotVariant, note: j.note ?? null, confidence: j.confidence ?? null, issueOk, coverOk, debug: j._debug ?? null, error: j.error ?? null };
    results.push(row);
    const stages = Object.entries(row.debug?.ms ?? {})
      .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`)
      .join(' · ');
    console.log(`${coverOk ? 'OK  ' : issueOk ? 'ISS ' : 'MISS'} ${c.label.padEnd(58)} → ${row.gotTitle ?? '-'}${row.note ? ` [${row.note}]` : ''} (${Math.round(row.ms / 1000)}s: ${stages})`);
  };
  const queue = [...cases];
  await Promise.all(
    [0, 1, 2].map(async () => {
      while (queue.length) await run(queue.shift());
    }),
  );
} finally {
  await fetch(`${BASE}/rest/v1/profiles?id=eq.${user.id}`, { method: 'DELETE', headers: H });
  await fetch(`${BASE}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: H });
}
const n = results.length;
const issue = results.filter((r) => r.issueOk).length;
const cover = results.filter((r) => r.coverOk).length;
const secs = results.map((r) => r.ms / 1000).sort((a, b) => a - b);
const median = secs[Math.floor(secs.length / 2)] ?? 0;
console.log(
  `\nissue correct ${issue}/${n} (${Math.round((issue / n) * 100)}%) · exact cover ${cover}/${n} (${Math.round((cover / n) * 100)}%) · median ${median.toFixed(1)}s · max ${(secs.at(-1) ?? 0).toFixed(1)}s`,
);
fs.writeFileSync(path.join(OUT, '..', `scan-eval${reportTag ? `-${reportTag}` : ''}.json`), JSON.stringify(results, null, 2));
