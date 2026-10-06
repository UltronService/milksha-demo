#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  restartCloud,
  resetCloudState,
  startSite,
  PORT_SITE,
  installBundledCloudRouteShim,
  isolatedCloudContext,
} from '../tests/e2e/harness.mjs';

const OUT = '/opt/cursor/artifacts/cloud-remote-qa';
const BASE = `http://127.0.0.1:${PORT_SITE}`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  await restartCloud();
  await resetCloudState({ seedDevice: true });
  await startSite();
  const browser = await chromium.launch();
  try {
    const boardCtx = await isolatedCloudContext(browser);
    const ctrlCtx = await isolatedCloudContext(browser);
    const boardPage = await boardCtx.newPage({ viewport: { width: 1920, height: 1080 } });
    const ctrlDesktop = await ctrlCtx.newPage({ viewport: { width: 1440, height: 900 } });
    const ctrlPhone = await ctrlCtx.newPage({ viewport: { width: 390, height: 844 } });
    for (const p of [boardPage, ctrlDesktop, ctrlPhone]) {
      await installBundledCloudRouteShim(p);
    }
    await boardPage.goto(`${BASE}/`);
    await ctrlDesktop.goto(`${BASE}/controller/`);
    await ctrlPhone.goto(`${BASE}/controller/`);
    await boardPage.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await ctrlDesktop.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await ctrlPhone.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await ctrlDesktop.screenshot({ path: join(OUT, 'controller-1440-route.png'), fullPage: true });
    await ctrlPhone.screenshot({ path: join(OUT, 'controller-390-route.png'), fullPage: true });
    await ctrlDesktop.click('[data-testid="btn-send-numbers"]');
    await boardPage.waitForFunction(
      () => document.querySelectorAll('.milksha-ready .milksha-num').length >= 1,
      { timeout: 5000 },
    );
    await boardPage.screenshot({ path: join(OUT, 'board-after-remote-send.png'), fullPage: true });
    console.log('Saved artifacts to', OUT);
    await boardCtx.close();
    await ctrlCtx.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
