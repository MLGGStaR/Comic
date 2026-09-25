// End-to-end check of collector cover photos (covers the catalogue lacks):
// a throwaway user uploads a photo into their storage folder, lists it for an
// issue, the API shows it as a variant, and a cover scan weighs it as a
// candidate. Everything is removed afterwards.
// usage: node scripts/custom-cover-check.mjs [--scan]
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync('C:/Users/S0000005749/Desktop/LetterSizd/web-deploy.json', 'utf8'));
const BASE = 'https://fotppunwikhxhvzzlgfy.supabase.co';
const FN = `${BASE}/functions/v1/comic-api`;
const SVC = cfg.supabaseServiceKey;
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvdHBwdW53aWtoeGh2enpsZ2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3OTQ2MDIsImV4cCI6MjEwMDM3MDYwMn0.XhR8V1VN4ffxqiShq2g5NOgx9DL9N1lstznNMlqFM3E';
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };
const COMIC = { id: '2463692', title: 'Absolute Batman #1' };
// stand-in for a collector's photo: the FOMO Books edition's cover image
const PHOTO_BYTES = Buffer.from(await (await fetch('https://s3.amazonaws.com/comicgeeks/comics/covers/large-5840019.jpg')).arrayBuffer());
const doScan = process.argv.includes('--scan');

const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) process.exitCode = 1;
};

const tag = Date.now().toString().slice(-6);
const email = `cc+${tag}@longbox.test`;
const password = `Cc-${tag}-Aa1!x`;
const user = await (await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username: `cc${tag}` } }) })).json();
const id = crypto.randomUUID();
const path = `${user.id}/${id}.jpg`;
try {
  const tok = (await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token;
  const U = { apikey: ANON, Authorization: `Bearer ${tok}` };

  // someone else's folder is refused
  const bad = await fetch(`${BASE}/storage/v1/object/comic-covers/00000000-0000-0000-0000-000000000000/${id}.jpg`, { method: 'POST', headers: { ...U, 'Content-Type': 'image/jpeg' }, body: PHOTO_BYTES });
  ok(!bad.ok, `upload into another user's folder is refused (${bad.status})`);

  const up = await fetch(`${BASE}/storage/v1/object/comic-covers/${path}`, { method: 'POST', headers: { ...U, 'Content-Type': 'image/jpeg' }, body: PHOTO_BYTES });
  ok(up.ok, `upload into your own folder (${up.status})`);
  const url = `${BASE}/storage/v1/object/public/comic-covers/${path}`;
  const pub = await fetch(url);
  ok(pub.ok && (pub.headers.get('content-type') ?? '').startsWith('image/'), `photo is public (${pub.status} ${pub.headers.get('content-type')})`);

  const spoof = await fetch(`${BASE}/rest/v1/comic_custom_covers`, {
    method: 'POST',
    headers: { ...U, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ comic_id: COMIC.id, name: 'spoof', image_url: url, created_by: '00000000-0000-0000-0000-000000000000' }),
  });
  ok(!spoof.ok, `listing a cover as someone else is refused (${spoof.status})`);

  const ins = await fetch(`${BASE}/rest/v1/comic_custom_covers`, {
    method: 'POST',
    headers: { ...U, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ id, comic_id: COMIC.id, name: 'FOMO Books exclusive (test)', image_url: url, created_by: user.id }),
  });
  ok(ins.ok, `list it for ${COMIC.title} (${ins.status})`);

  const d = await (await fetch(`${FN}?${new URLSearchParams({ op: 'comic', ...COMIC })}`, { headers: U })).json();
  const v = (d.variants ?? []).find((x) => x.id === `custom:${id}`);
  ok(!!v && v.custom === true && v.cover === url && v.by === user.id, `op=comic shows it as a variant (${d.variants?.length} covers)`);

  if (doScan) {
    const r = await fetch(`${FN}?op=scan`, {
      method: 'POST',
      headers: { ...U, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: PHOTO_BYTES.toString("base64"), debug: true }),
    });
    const j = await r.json();
    console.log('      scan →', j.comic?.title, '·', j.note ?? 'main cover', '· collector photos weighed:', JSON.stringify(j._debug?.custom));
    ok(j.comic?.id === COMIC.id || j.comic?.id === '5840019', 'scan finds the issue (US or FOMO edition — same art)');
    ok((j._debug?.custom ?? []).some((n) => n.includes('FOMO Books exclusive (test)')), 'the collector photo is among the covers the scan compares');
  }
} finally {
  const del = await fetch(`${BASE}/rest/v1/comic_custom_covers?id=eq.${id}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=representation' } });
  const rm = await fetch(`${BASE}/storage/v1/object/comic-covers/${path}`, { method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  console.log(`cleanup: listing ${del.status}, photo ${rm.status}`);
  await fetch(`${BASE}/rest/v1/profiles?id=eq.${user.id}`, { method: 'DELETE', headers: H });
  await fetch(`${BASE}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: H });
  const left = await (await fetch(`${BASE}/rest/v1/comic_custom_covers?select=id&comic_id=eq.${COMIC.id}&name=like.*test*`, { headers: H })).json();
  ok(Array.isArray(left) && left.length === 0, 'nothing left behind');
}
