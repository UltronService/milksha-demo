#!/usr/bin/env node
/** One round: count board applyPayload commits via perf hook (live vs fake). */
import { chromium } from 'playwright';
import {
  ensureCloudRunning,
  resetCloudState,
  startSite,
  installBundledCloudRouteShim,
  PORT_SITE,
} from '../tests/e2e/harness.mjs';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from '../tests/e2e/board-animation-live-setup.mjs';
import { LIVE_CLOUD_BOARD_DEVICE, LIVE_CLOUD_STORE_ID } from '../tests/e2e/live-cloud-config.mjs';
import { sendClearNow } from '../tests/e2e/live-cloud-teardown.mjs';

const STORE = String(process.env.LIVE_CLOUD_STORE_ID || LIVE_CLOUD_STORE_ID || 'zz-qa-ci-store').trim();
const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'fake';

async function installApplyHook(board) {
  await board.evaluate(() => {
    window.__applyPayloadCount = 0;
    const rt = window.QMS?.runtime;
    if (!rt || !rt.applyPayload) {
      throw new Error('runtime.applyPayload missing');
    }
    const orig = rt.applyPayload.bind(rt);
    rt.applyPayload = function (...args) {
      window.__applyPayloadCount += 1;
      return orig(...args);
    };
  });
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(180000);

  let board;
  let ctrl;
  if (mode === 'live') {
    await installLiveBranchCloudRoutes(ctx);
    board = await ctx.newPage();
    ctrl = await ctx.newPage();
    await board.goto(`${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=${LIVE_CLOUD_BOARD_DEVICE}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
    await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  } else {
    await ensureCloudRunning();
    await startSite();
    await resetCloudState({ seedDevice: true });
    board = await ctx.newPage();
    ctrl = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(ctrl);
    const base = `http://127.0.0.1:${PORT_SITE}`;
    await board.goto(`${base}/?mode=cloud&store=${STORE}&device=stb-01`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 60000 });
    await ctrl.goto(`${base}/controller/?mode=cloud&store=${STORE}`);
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 60000 });
  }

  await installApplyHook(board);
  await sendClearNow(ctrl);
  await board.waitForFunction(() => document.querySelectorAll('.milksha-board-chip').length === 0, undefined, {
    timeout: mode === 'live' ? 120000 : 30000,
  });

  const counts = [];
  for (let i = 0; i < 5; i += 1) {
    const before = await board.evaluate(() => window.__applyPayloadCount || 0);
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
      i + 1,
      { timeout: 60000 },
    );
    await board.waitForTimeout(800);
    const after = await board.evaluate(() => window.__applyPayloadCount || 0);
    counts.push({ send: i + 1, applyDelta: after - before, total: after });
  }

  await browser.close();
  console.log(JSON.stringify({ mode, store: STORE, counts }, null, 2));
}

await main();
