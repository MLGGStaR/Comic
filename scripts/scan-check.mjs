// End-to-end cover-scan check: renders a catalogue cover as a skewed, glared
// "phone photo" (Playwright), signs in a throwaway user, POSTs the photo to
// comic-api?op=scan, prints what came back, deletes the user.
// usage: node scripts/scan-check.mjs [coverId=7631639]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const cfg = JSON.parse(fs.readFileSync('C:/Users/S0000005749/Desktop/LetterSizd/web-deploy.json', 'utf8'));
const BASE = 'https://fotppunwikhxhvzzlgfy.supabase.co';
const SVC = cfg.supabaseServiceKey;
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvdHBwdW53aWtoeGh2enpsZ2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3OTQ2MDIsImV4cCI6MjEwMDM3MDYwMn0.XhR8V1VN4ffxqiShq2g5NOgx9DL9N1lstznNMlqFM3E';
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };
const coverId = process.argv[2] ?? '7631639'; // Absolute Batman #2 Cover B (Daniel Warren Johnson)
const OUT = path.resolve('scripts/smoke-out');
fs.mkdirSync(OUT, { recursive: true });

// 1) a fake phone photo of the cover
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await page.setContent(`<body style="margin:0;background:#6b5a48;display:flex;align-items:center;justify-content:center;height:100vh;perspective:1400px">
  <div style="transform:rotateX(9deg) rotateY(-11deg) rotateZ(3deg);box-shadow:0 30px 60px rgba(0,0,0,.6);position:relative">
    <img src="https://s3.amazonaws.com/comicgeeks/comics/covers/large-${coverId}.jpg" style="width:560px;display:block;filter:brightness(1.08) contrast(.92) saturate(.9)">
    <div style="position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.35) 45%,transparent 55%)"></div>
  </div></body>`);
await page.waitForTimeout(2500);
const photoPath = path.join(OUT, `scan-photo-${coverId}.jpg`);
await page.screenshot({ path: photoPath, type: 'jpeg', quality: 82 });
await browser.close();
const image = fs.readFileSync(photoPath).toString('base64');

// 2) throwaway user + session
const tag = Date.now().toString().slice(-6);
const email = `scan+${tag}@longbox.test`;
const password = `Scan-${tag}-Aa1!x`;
const created = await (await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username: `scan${tag}` } }) })).json();
try {
  const tok = await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  const t0 = Date.now();
  const r = await fetch(`${BASE}/functions/v1/comic-api?op=scan`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  const j = await r.json();
  console.log(`scan → ${r.status} in ${Date.now() - t0}ms`);
  console.log('read as:', JSON.stringify(j.read));
  console.log('comic:', j.comic?.id, j.comic?.title, '| variant:', j.variantId ?? '(main)', j.note ?? '', '| confidence:', j.confidence, j.error ?? '');
  console.log('candidates:', (j.candidates ?? []).map((c) => c.title).slice(0, 5).join(' · '));
} finally {
  await fetch(`${BASE}/rest/v1/profiles?id=eq.${created.id}`, { method: 'DELETE', headers: H });
  await fetch(`${BASE}/auth/v1/admin/users/${created.id}`, { method: 'DELETE', headers: H });
}
