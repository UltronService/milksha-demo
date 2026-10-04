import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PORT_SITE, freshContext, waitForReceiverOnline, startSite } from '../tests/e2e/harness.mjs';

const OUT = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });

await startSite();

const base = `http://127.0.0.1:${PORT_SITE}`;

const browser = await chromium.launch({ headless: true });
const ctx = await freshContext(browser);
const board = await ctx.newPage();
const controller = await ctx.newPage();

await controller.setViewportSize({ width: 1920, height: 1080 });
await board.setViewportSize({ width: 1920, height: 1080 });

await controller.goto(`${base}/controller/`);
await controller.waitForFunction(
  () => {
    const el = document.getElementById('online-state');
    return el && el.getAttribute('data-connected') === '1';
  },
  { timeout: 20000 },
);
await controller.screenshot({
  path: join(OUT, 'controller-on-load-1920x1080.png'),
  fullPage: true,
});

await board.goto(`${base}/`);
await board.waitForFunction(
  () => Boolean(window.QMS && window.QMS.runtime && window.receiverCloud),
  { timeout: 25000 },
);
await waitForReceiverOnline(board, 'local');
await controller.click('[data-testid="btn-send-numbers"]');
await board.waitForSelector('.milksha-ready .milksha-num', { timeout: 5000 });
await board.screenshot({
  path: join(OUT, 'home-board-after-send-1920x1080.png'),
  fullPage: false,
});

await ctx.close();
await browser.close();
