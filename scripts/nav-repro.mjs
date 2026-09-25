// Repro for navigation glitches: (1) a quick second tap on a search result
// lands inside the freshly opened comic page; (2) an edge swipe on a stack of
// screens closes more than one. Runs against SITE_URL (default: local preview).
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';

const cfg = JSON.parse(fs.readFileSync('C:/Users/S0000005749/Desktop/LetterSizd/web-deploy.json', 'utf8'));
const BASE = 'https://fotppunwikhxhvzzlgfy.supabase.co';
const H = { apikey: cfg.supabaseServiceKey, Authorization: `Bearer ${cfg.supabaseServiceKey}`, 'Content-Type': 'application/json' };
let SITE = process.env.SITE_URL;
let server = null;
if (!SITE) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4192', '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  SITE = 'http://localhost:4192/Comic/';
}
const tag = Date.now().toString().slice(-6);
const email = `nav+${tag}@longbox.test`;
const password = `Nav-${tag}-Aa1!x`;
const user = await (await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username: `nav${tag}` } }) })).json();
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // mid-range phone
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
  await page.locator('nav button[aria-label="Search"]').click();
  await page.locator('#search-input').fill('absolute batman #3');
  const result = page.getByRole('button', { name: 'Absolute Batman #3' }).first();
  await result.waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);

  // (1) double tap: second tap 250 ms after the first, same spot
  const box = await result.boundingBox();
  const x = box.x + box.width * 0.6;
  const y = box.y + box.height * 0.3;
  const t0 = Date.now();
  await page.touchscreen.tap(x, y);
  await page.locator('.screen-in').first().waitFor({ timeout: 10000 });
  const openMs = Date.now() - t0;
  await page.waitForTimeout(Math.max(0, 250 - openMs));
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(2500);
  const rows = await (await fetch(`${BASE}/rest/v1/comic_entries?user_id=eq.${user.id}&select=comic_id,owned,read,wishlist`, { headers: H })).json();
  const layers = await page.locator('.screen-in').count();
  const zoomed = await page.locator('.z-50.bg-black\\/95').count();
  console.log(`(1) screen visible after ${openMs}ms · layers after 2nd tap: ${layers} · accidental entries: ${JSON.stringify(rows)} · cover zoom opened by 2nd tap: ${zoomed > 0}`);
  if (zoomed) {
    await page.locator('.z-50.bg-black\\/95').click();
    await page.waitForTimeout(500);
  }

  // (2) edge swipe with 3 stacked screens
  const top = () => page.locator('.screen-in').last();
  await top().getByText(/All of Absolute Batman/).click();
  await page.getByText('Issues', { exact: false }).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await top().getByRole('button', { name: 'Absolute Batman #4' }).first().click();
  await page.waitForTimeout(1200);
  const before = await page.locator('.screen-in').count();
  const swipe = async () => {
    const vw = 390;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 6, y: 420 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 6 + (vw * 0.6 * i) / 10, y: 424 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await swipe();
  await page.waitForTimeout(900);
  const after = await page.locator('.screen-in').count();
  console.log(`(2) layers before swipe ${before} → after ${after} (expected ${before - 1})`);
} finally {
  await browser.close();
  server?.kill();
  await fetch(`${BASE}/rest/v1/comic_entries?user_id=eq.${user.id}`, { method: 'DELETE', headers: H });
  await fetch(`${BASE}/rest/v1/profiles?id=eq.${user.id}`, { method: 'DELETE', headers: H });
  await fetch(`${BASE}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: H });
}
