// End-to-end check that the home-screen app updates itself: build version A
// and version B, serve A the way GitHub Pages does (Cache-Control:
// max-age=600), open it as an installed iPhone app with its service worker,
// "deploy" B underneath, bring the app to the foreground → it must land on B
// by itself, tidy its address and not reload again.
// usage: node scripts/update-e2e.mjs
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, devices } from 'playwright';

const ROOT = path.join(os.tmpdir(), 'longbox-update-e2e');
const A = 'aaaaaaa1110000';
const B = 'bbbbbbb2220000';
const build = (id) => {
  const out = path.join(ROOT, id);
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { env: { ...process.env, VITE_BUILD_ID: id }, stdio: 'inherit' });
  fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ build: id }));
  return out;
};
console.log('building A and B…');
const dirA = build(A);
const dirB = build(B);

let current = dirA;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith('/Comic/')) return res.writeHead(404).end();
  let file = path.join(current, decodeURIComponent(u.pathname.slice('/Comic/'.length)) || 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(current, 'index.html'); // Pages 404.html = the app
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(4193, r));
const SITE = 'http://localhost:4193/Comic/';

let failed = 0;
const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) failed++;
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'allow' });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  const page = await ctx.newPage();
  const navs = [];
  page.on('framenavigated', (f) => f === page.mainFrame() && navs.push(f.url()));

  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Just browse' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  ok(await page.getByText(`version ${A.slice(0, 7)}`).isVisible(), 'running version A');
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await page.getByText('up to date').waitFor({ timeout: 5000 });
  ok(true, '"Check for updates" on the latest version says up to date');
  ok(await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active)), 'service worker installed (like the home-screen app)');

  // deploy B underneath the running app, then come back to it
  current = dirB;
  const before = navs.length;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  // wait for the update navigation itself, then for the new page to settle
  for (let i = 0; i < 150 && !navs.slice(before).some((u) => u.includes('?v=')); i++) await page.waitForTimeout(100);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Just browse' }).click({ timeout: 3000 }).catch(() => {});
  await page.getByRole('button', { name: 'Settings' }).click();
  const landed = await page.getByText(`version ${B.slice(0, 7)}`).isVisible();
  ok(landed, 'coming back to the app after a deploy lands on version B by itself');
  ok(navs.slice(before).some((u) => u.includes(`?v=${B.slice(0, 12)}`)), `the update reload went to the one-off address (${navs.slice(before).join(' → ')})`);
  ok(new URL(page.url()).search === '', `address tidied afterwards (${page.url()})`);

  const settled = navs.length;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(4000);
  ok(navs.length === settled, 'no further reloads once up to date');
} finally {
  await browser.close();
  server.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exitCode = failed ? 1 : 0;
