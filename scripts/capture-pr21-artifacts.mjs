#!/usr/bin/env node
/**
 * Capture PR #21 screenshots: controller 1440/1920, board after one send, clear before/after.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCloudRunning, startSite, PORT_SITE, waitForReceiverOnline } from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = '/opt/cursor/artifacts/pr21-screenshots';
const BASE = `http://127.0.0.1:${PORT_SITE}`;

async function captureViewport(browser, width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  await board.goto(`${BASE}/`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await controller.goto(`${BASE}/controller/`);
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 15000 });
  await waitForReceiverOnline(board, 'local');

  await controller.screenshot({
    path: join(OUT, `controller-${label}-collapsed-${width}.png`),
    fullPage: true,
  });

  await controller.locator('[data-testid="zone-toggle-pos"]').click();
  await controller.screenshot({
    path: join(OUT, `controller-${label}-pos-expanded-${width}.png`),
    fullPage: true,
  });

  await controller.click('[data-testid="btn-send-numbers"]');
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-ready .milksha-num').length === 1,
    { timeout: 8000 },
  );
  await board.screenshot({
    path: join(OUT, `board-${label}-one-number-${width}.png`),
    fullPage: true,
  });

  await controller.locator('[data-testid="zone-toggle-special"]').click();
  await board.screenshot({
    path: join(OUT, `board-${label}-before-clear-${width}.png`),
    fullPage: true,
  });
  await controller.click('[data-testid="btn-clear-now"]');
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
    { timeout: 8000 },
  );
  await board.screenshot({
    path: join(OUT, `board-${label}-after-clear-${width}.png`),
    fullPage: true,
  });

  await ctx.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await ensureCloudRunning();
  await startSite();
  const browser = await chromium.launch();
  try {
    await captureViewport(browser, 1440, 900, '1440');
    await captureViewport(browser, 1920, 1080, '1920');
    console.log('Saved screenshots to', OUT);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
