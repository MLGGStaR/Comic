// Phone-viewport smoke test (Playwright, iPhone 14). Creates a throwaway
// account, walks every tab, screen and sheet, logs a comic via hold →
// quick-log, feeds a real barcode to the live scanner through a fake camera,
// screenshots everything, checks overflow / broken text / JS errors, then
// deletes the account. Run: npm run smoke   (SITE_URL=… to test the live site)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import bwipjs from 'bwip-js';
import { chromium, devices } from 'playwright';

const cfg = JSON.parse(fs.readFileSync('C:/Users/S0000005749/Desktop/LetterSizd/web-deploy.json', 'utf8'));
const BASE = 'https://fotppunwikhxhvzzlgfy.supabase.co';
const SVC = cfg.supabaseServiceKey;
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };
const OUT = path.resolve('scripts/smoke-out');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let SITE = process.env.SITE_URL;
let server = null;
if (!SITE) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4191', '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  SITE = 'http://localhost:4191/Comic/';
}

const fails = [];
const passes = [];
let page = null;
const check = async (name, fn) => {
  try {
    await fn();
    passes.push(name);
    console.log(`PASS  ${name}`);
  } catch (e) {
    fails.push(`${name}: ${String(e.message).split('\n')[0]}`);
    console.log(`FAIL  ${name} — ${String(e.message).split('\n')[0]}`);
    await page?.screenshot({ path: path.join(OUT, `FAIL-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`) }).catch(() => {});
  }
};

// ── throwaway account ──
const tag = Date.now().toString().slice(-6);
const email = `smoke+${tag}@longbox.test`;
const password = `Smoke-${tag}-Aa1!x`;
const user = await (await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username: `smoke${tag}` } }) })).json();
if (!user.id) throw new Error(`create user failed: ${JSON.stringify(user).slice(0, 200)}`);
console.log(`test user ${email} — site ${SITE}`);

// a real barcode (Absolute Batman #2, cover A) rendered for the fake camera
const barcodePng = await bwipjs.toBuffer({ bcid: 'upca', text: '761941385846 00211', scale: 4, height: 20, includetext: true, addongap: 9, paddingwidth: 40, paddingheight: 30, backgroundcolor: 'FFFFFF' });
const barcodeDataUrl = `data:image/png;base64,${barcodePng.toString('base64')}`;

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US', serviceWorkers: 'block', permissions: ['camera'] });
  // fake camera: a canvas stream showing the barcode (drives the real decode loop)
  await ctx.addInitScript((src) => {
    const img = new Image();
    img.src = src;
    const fake = async () => {
      const c = document.createElement('canvas');
      c.width = 1280;
      c.height = 720;
      const g = c.getContext('2d');
      const draw = () => {
        g.fillStyle = '#ddd';
        g.fillRect(0, 0, c.width, c.height);
        if (img.complete) {
          const w = 900;
          const h = (img.height / img.width) * w;
          g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
        }
        requestAnimationFrame(draw);
      };
      draw();
      return c.captureStream(15);
    };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = fake;
  }, barcodeDataUrl);
  page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(`PAGEERROR ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && /Uncaught|TypeError|ReferenceError/.test(m.text())) jsErrors.push(m.text());
  });

  const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
  const settle = (ms = 800) => page.waitForTimeout(ms);
  const noOverflow = async () => {
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (sw > iw + 1) throw new Error(`horizontal overflow ${sw}px > ${iw}px`);
  };
  const noBadText = async () => {
    const t = await page.evaluate(() => document.body.innerText);
    for (const bad of ['undefined', 'NaN', '[object Object]']) if (t.includes(bad)) throw new Error(`"${bad}" visible`);
  };
  const screen = async (n) => {
    await noOverflow();
    await noBadText();
    await shot(n);
  };
  const tab = async (label) => {
    await page.locator(`nav button[aria-label="${label}"]`).click();
    await settle();
  };

  await check('login', async () => {
    await page.goto(SITE, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
    await page.locator('nav button[aria-label="Home"]').waitFor({ timeout: 15000 });
    await settle(1500);
    await screen('01-home-empty');
  });

  await check('search: absolute batman #2 → top result', async () => {
    await tab('Search');
    await page.locator('#search-input').fill('absolute batman #2');
    await page.getByText('Absolute Batman #2', { exact: true }).first().waitFor({ timeout: 30000 });
    await settle(600);
    await screen('02-search-top');
  });

  await check('comic page: overview, variants, reviews', async () => {
    await page.getByRole('button', { name: 'Absolute Batman #2' }).first().click();
    await page.getByText('Overview', { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText('Scott Snyder').first().waitFor({ timeout: 40000 });
    await settle(800);
    await screen('03-comic-overview');
    await page.getByRole('button', { name: /^Variants/ }).click();
    await page.getByText('Cover B Daniel Warren Johnson Variant').waitFor({ timeout: 10000 });
    await settle(600);
    await screen('04-comic-variants');
    await page.getByRole('button', { name: /^Reviews/ }).click();
    await page.getByText('Critics', { exact: false }).first().waitFor({ timeout: 10000 });
    await settle(600);
    await screen('05-comic-reviews');
  });

  await check('status toggles save (Have it + rating)', async () => {
    const top = page.locator('.screen-in').last(); // the pushed comic screen, not the tab under it
    await top.getByRole('button', { name: /^Overview/ }).click();
    await top.getByRole('button', { name: 'Have it' }).click();
    const slider = top.getByRole('slider', { name: 'Rating' });
    const box = await slider.boundingBox();
    await page.mouse.click(box.x + box.width * 0.88, box.y + box.height / 2);
    await page.waitForTimeout(2500);
    const rows = await (await fetch(`${BASE}/rest/v1/comic_entries?user_id=eq.${user.id}&select=comic_id,owned,read,rating`, { headers: H })).json();
    const r = rows.find((x) => x.comic_id === '8081353');
    if (!r || !r.owned || !r.read || Number(r.rating) !== 4.5) throw new Error(`db row ${JSON.stringify(rows)}`);
    await screen('06-comic-logged');
    await top.getByRole('button', { name: 'Back' }).click();
    await settle();
  });

  await check('pick the cover you own, log it as CGC 9.8, see graded prices', async () => {
    await page.getByRole('button', { name: 'Absolute Batman #2' }).first().click();
    const top = page.locator('.screen-in').last();
    await top.getByText('Which cover do you have?').waitFor({ timeout: 20000 });
    await settle(700); // a page ignores taps while it slides in (ghost-tap guard)
    await top.getByRole('button', { name: /^Main/ }).first().click();
    await top.getByRole('button', { name: 'Raw · graded?' }).waitFor({ timeout: 10000 });
    await top.getByRole('button', { name: 'Raw · graded?' }).click();
    const sheet = page.getByRole('dialog', { name: 'Grade' });
    await sheet.getByRole('button', { name: 'CGC', exact: true }).click();
    await sheet.getByRole('button', { name: '9.8', exact: true }).click();
    await sheet.getByText('Worth at CGC 9.8').waitFor({ timeout: 30000 });
    await settle(400);
    await shot('06b-grade-sheet');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(2500);
    const rows = await (await fetch(`${BASE}/rest/v1/comic_entries?user_id=eq.${user.id}&select=comic_id,variants`, { headers: H })).json();
    const v = rows.find((x) => x.comic_id === '8081353')?.variants?.[0];
    if (!v || v.id !== '8081353' || v.grade?.by !== 'CGC' || v.grade?.grade !== 9.8) throw new Error(`db variants ${JSON.stringify(rows)}`);
    await top.getByText('Graded (CGC / CBCS)').waitFor({ timeout: 30000 });
    await top.getByRole('button', { name: 'CGC 9.8' }).scrollIntoViewIfNeeded();
    await settle(600);
    await screen('06c-graded-copy');
    await top.getByRole('button', { name: 'Back' }).click();
    await settle();
  });

  await check('hold a cover → quick log → wishlist', async () => {
    await page.locator('#search-input').fill('saga #1');
    await page.getByText('Saga #1', { exact: true }).first().waitFor({ timeout: 30000 });
    const cover = page.locator('.cover').first();
    const b = await cover.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.getByRole('dialog', { name: 'Log comic' }).waitFor({ timeout: 5000 });
    await settle(400);
    await shot('07-quicklog');
    await page.getByRole('dialog', { name: 'Log comic' }).getByRole('button', { name: 'Wishlist' }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Done' }).click();
    const rows = await (await fetch(`${BASE}/rest/v1/comic_entries?user_id=eq.${user.id}&select=comic_id,wishlist`, { headers: H })).json();
    if (!rows.some((x) => x.wishlist)) throw new Error(`no wishlist row ${JSON.stringify(rows)}`);
  });

  await check('a trade counts the issues it collects (House of M TP), and you can correct it', async () => {
    await page.locator('#search-input').fill('house of m tp');
    await page.getByRole('button', { name: /House of M TP/ }).first().waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: /House of M TP/ }).first().click();
    const top = page.locator('.screen-in').last();
    await top.getByText('Overview', { exact: true }).waitFor({ timeout: 15000 });
    await settle(700);
    await top.getByRole('button', { name: 'Read', exact: true }).click();
    const card = top.locator('div.rounded-2xl', { hasText: 'Collects' }).first();
    await card.getByText('8 issues').waitFor({ timeout: 30000 });
    await card.getByText(/House of M #1.8/).waitFor({ timeout: 5000 });
    await card.getByRole('button', { name: 'Edit', exact: true }).click();
    await card.getByRole('button', { name: 'One fewer' }).click();
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await card.getByText('7 issues').waitFor({ timeout: 5000 });
    await page.waitForTimeout(2000);
    const rows = await (await fetch(`${BASE}/rest/v1/comic_entries?user_id=eq.${user.id}&comic_id=eq.6759046&select=read,issues`, { headers: H })).json();
    if (!rows[0]?.read || rows[0]?.issues !== 7) throw new Error(`db row ${JSON.stringify(rows)}`);
    await card.scrollIntoViewIfNeeded();
    await settle(300);
    await screen('07b-trade-collects');
    await top.getByRole('button', { name: 'Back' }).click();
    await settle();
  });

  await check('calendar: month grid + day list', async () => {
    await tab('Calendar');
    await page.locator('button[aria-label$="releases"]').first().waitFor({ timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('button[aria-label$="releases"] img').length > 4, null, { timeout: 45000 });
    await settle(1500);
    await screen('08-calendar');
    await page.evaluate(() => window.scrollTo(0, 900));
    await settle(500);
    await shot('09-calendar-day');
  });

  await check('my comics: shelves, portfolio, stats', async () => {
    await tab('My Comics');
    await page.getByText('Portfolio · est. value').waitFor({ timeout: 10000 });
    await settle(800);
    await screen('10-mycomics');
    await page.getByRole('button', { name: /^Comics, / }).click();
    await page.getByPlaceholder('Search comics…').waitFor({ timeout: 10000 });
    await settle(600);
    await screen('11-shelf-owned');
    // the one comic owned so far has been read: "Not read" hides it, "Read" shows it
    const shelfTop = page.locator('.screen-in').last();
    await shelfTop.getByRole('button', { name: /^Not read/ }).click();
    await shelfTop.getByText('All read').waitFor({ timeout: 5000 });
    await shot('11b-shelf-not-read');
    await shelfTop.getByRole('button', { name: 'Read', exact: true }).click();
    await shelfTop.getByRole('button', { name: /Absolute Batman #2/ }).first().waitFor({ timeout: 5000 });
    await shelfTop.getByRole('button', { name: 'All', exact: true }).click();
    await page.locator('.screen-in').last().getByRole('button', { name: 'Back' }).click();
    await settle(500);
    // Read: Absolute Batman #2 + House of M TP (your count: 7) = 2 comics, 8 issues
    await page.getByRole('button', { name: /^Read, / }).click();
    await page.locator('.screen-in').last().getByText('2 comics').waitFor({ timeout: 10000 });
    await page.locator('.screen-in').last().getByText('8 issues').waitFor({ timeout: 10000 });
    await settle(500);
    await screen('11c-shelf-read-issues');
    await page.locator('.screen-in').last().getByRole('button', { name: 'Back' }).click();
    await settle(500);
    await page.getByText('Portfolio · est. value').click();
    await page.getByText('Estimated value').waitFor({ timeout: 10000 });
    await settle(1200);
    await screen('12-portfolio');
    await page.locator('.screen-in').last().getByRole('button', { name: 'Back' }).click();
    await settle(500);
    await page.getByText('Stats', { exact: true }).click();
    await page.locator('.screen-in').last().getByText('Superhero').waitFor({ timeout: 30000 }); // genre tags arrived
    await settle(900);
    await screen('13-stats');
    await page.locator('.screen-in').last().getByRole('button', { name: 'Back' }).click();
    await settle(500);
  });

  await check('home: numbers + rows', async () => {
    await tab('Home');
    await page.getByText('New this week').waitFor({ timeout: 30000 });
    await settle(1200);
    await screen('14-home');
  });

  await check('barcode scanner reads the add-on and finds the comic', async () => {
    await tab('My Comics');
    await page.getByRole('button', { name: 'Add comics' }).click();
    await page.getByText('Scan barcode').click();
    await page.getByText('Barcode match').waitFor({ timeout: 40000 });
    await settle(700);
    await shot('15-scan-barcode');
    const txt = await page.evaluate(() => document.body.innerText);
    if (!txt.includes('Absolute Batman #2')) throw new Error('wrong comic');
    await page.getByRole('button', { name: 'Close scanner' }).click();
    await settle(500);
  });

  await check('still in the app after closing layers', async () => {
    if (!page.url().includes('/Comic/')) throw new Error(`left the app: ${page.url()}`);
    await page.locator('nav button[aria-label="Home"]').waitFor({ timeout: 3000 });
  });

  await check('android back closes the top screen, not the app', async () => {
    await tab('Search');
    await page.locator('#search-input').fill('absolute batman #2');
    await page.getByRole('button', { name: 'Absolute Batman #2' }).first().click();
    await page.locator('.screen-in').last().getByText('Overview', { exact: true }).waitFor({ timeout: 10000 });
    await page.goBack();
    await settle(600);
    if (await page.locator('.screen-in').count()) throw new Error('screen still open after back');
    if (!page.url().includes('/Comic/')) throw new Error(`left the app: ${page.url()}`);
    await page.locator('#search-input').waitFor({ timeout: 3000 });
  });

  await check('settings sheet', async () => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByText('Log out').waitFor({ timeout: 5000 });
    await settle(400);
    await shot('16-settings');
  });

  await check('no JS errors', async () => {
    if (jsErrors.length) throw new Error(jsErrors.slice(0, 3).join(' | '));
  });
} finally {
  await browser.close();
  server?.kill();
  for (const t of ['comic_entries', 'comic_follows', 'comic_value_history']) {
    await fetch(`${BASE}/rest/v1/${t}?user_id=eq.${user.id}`, { method: 'DELETE', headers: H });
  }
  await fetch(`${BASE}/rest/v1/profiles?id=eq.${user.id}`, { method: 'DELETE', headers: H });
  await fetch(`${BASE}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: H });
  console.log(`\n${passes.length} passed, ${fails.length} failed`);
  if (fails.length) {
    console.log(fails.join('\n'));
    process.exitCode = 1;
  }
}
