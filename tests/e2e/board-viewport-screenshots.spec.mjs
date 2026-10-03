import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urlsForMode } from './harness.mjs';

const ART = '/opt/cursor/artifacts/screenshots';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_ROOT = '/tmp/wt-6975672';
const RING_DIGITS = '8888';

const VIEWPORTS = [
  { width: 1920, height: 1080, tag: '1920x1080' },
  { width: 1366, height: 768, tag: '1366x768' },
  { width: 1280, height: 720, tag: '1280x720' },
  { width: 2560, height: 1080, tag: '2560x1080' },
  { width: 2560, height: 1440, tag: '2560x1440' },
];

function startStaticSite(rootDir) {
  const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml' };
  const server = createServer((req, res) => {
    let p = req.url?.split('?')[0] || '/';
    if (p === '/') p = '/receiver-demo/index.html';
    if (p.endsWith('/')) p += 'index.html';
    try {
      const file = join(rootDir, decodeURIComponent(p.replace(/^\//, '')));
      const data = readFileSync(file);
      const ext = file.split('.').pop();
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
    server.once('error', reject);
  });
}

async function showRing8888(page) {
  await page.waitForFunction(() => window.QMS?.Receiver?.RingHost?.playReadyRing, null, {
    timeout: 20000,
  });
  await page.evaluate((num) => {
    const RH = window.QMS.Receiver.RingHost;
    if (typeof RH.showRingOverlayForTests === 'function') {
      RH.showRingOverlayForTests(num);
    } else {
      RH.playReadyRing(num);
    }
  }, RING_DIGITS);
}

test('board ready 8888 screenshots at key viewports', async ({ browser }) => {
  mkdirSync(ART, { recursive: true });
  const { recv } = urlsForMode('local');
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setViewportSize(vp);
    await page.goto(recv);
    await showRing8888(page);
    await page.waitForTimeout(400);
    await expect(page.locator('.rcv-ring-num')).toHaveText(RING_DIGITS);
    await page.screenshot({
      path: `${ART}/board-ready-8888-${vp.tag}.png`,
      fullPage: false,
    });
    await ctx.close();
  }
});

test('6975672 baseline ring screenshot at 1920x1080', async ({ browser }) => {
  mkdirSync(ART, { recursive: true });
  const { server, base } = await startStaticSite(BASELINE_ROOT);
  try {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${base}/receiver-demo/?mode=local&store=s120030`);
    await showRing8888(page);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `${ART}/board-ready-8888-6975672-baseline-1920x1080.png`,
      fullPage: false,
    });
    await ctx.close();
  } finally {
    server.close();
  }
});
