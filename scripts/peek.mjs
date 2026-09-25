// Quick local look: serve dist/ with vite preview, open as an iPhone, screenshot
// the auth screen and each tab in guest mode. node scripts/peek.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const OUT = path.resolve('scripts/smoke-out/peek');
fs.mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4190', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://localhost:4190/Comic/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '00-auth.png') });
  await page.getByRole('button', { name: 'Just browse' }).click();
  await page.waitForTimeout(800);
  for (const tab of ['Home', 'Search', 'Calendar', 'My Comics']) {
    await page.locator(`nav button[aria-label="${tab}"]`).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `tab-${tab.replace(' ', '')}.png`) });
  }
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  console.log('overflow check', sw, iw, sw > iw + 1 ? 'OVERFLOW' : 'ok');
  console.log('errors:', errors.length ? errors.slice(0, 8) : 'none');
} finally {
  await browser.close();
  server.kill();
}
