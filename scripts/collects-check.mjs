// What the `collects` op answers for a user's collected editions (via a
// throwaway account, deleted afterwards). Answers are cached server-side.
// usage: node scripts/collects-check.mjs [username]
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync('C:/Users/S0000005749/Desktop/LetterSizd/web-deploy.json', 'utf8'));
const BASE = 'https://fotppunwikhxhvzzlgfy.supabase.co';
const SVC = cfg.supabaseServiceKey;
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvdHBwdW53aWtoeGh2enpsZ2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3OTQ2MDIsImV4cCI6MjEwMDM3MDYwMn0.XhR8V1VN4ffxqiShq2g5NOgx9DL9N1lstznNMlqFM3E';
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };
const who = process.argv[2] ?? 'MLGGStaR';
const [prof] = await (await fetch(`${BASE}/rest/v1/profiles?select=id&username=eq.${encodeURIComponent(who)}`, { headers: H })).json();
const rows = await (await fetch(`${BASE}/rest/v1/comic_entries?select=comic_id,read,meta&user_id=eq.${prof.id}&meta->>format=eq.collection`, { headers: H })).json();

const tag = Date.now().toString().slice(-6);
const email = `col+${tag}@longbox.test`;
const password = `Col-${tag}-Aa1!x`;
const user = await (await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username: `col${tag}` } }) })).json();
try {
  const tok = (await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token;
  const items = rows.map((r) => ({ key: r.meta.id, title: r.meta.title, publisher: r.meta.publisher, date: r.meta.releaseDate }));
  const t0 = Date.now();
  const res = await (await fetch(`${BASE}/functions/v1/comic-api?op=collects`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })).json();
  console.log(`${items.length} editions in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const r of rows) {
    const c = res[r.meta.id];
    console.log(`${r.read ? 'read ' : '     '} ${r.meta.title.padEnd(66)} → ${c?.issues ?? '?'} ${c?.collects ? `(${c.collects})` : '(unknown)'}`);
  }
} finally {
  await fetch(`${BASE}/rest/v1/profiles?id=eq.${user.id}`, { method: 'DELETE', headers: H });
  await fetch(`${BASE}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: H });
}
