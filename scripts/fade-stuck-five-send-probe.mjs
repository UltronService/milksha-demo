#!/usr/bin/env node
/**
 * Minimal probe: 5× btn-send-numbers, then strict "all non-float chips opacity≥0.99".
 * Usage:
 *   node scripts/fade-stuck-five-send-probe.mjs --mode fake
 *   LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-five-send-probe.mjs --mode live
 */
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

async function sampleOpacities(board) {
  return board.evaluate(() => {
    const chips = [...document.querySelectorAll('.milksha-board-chip:not(.milksha-board-chip--layer-float)')];
    return {
      readyNums: document.querySelectorAll('.milksha-ready .milksha-num').length,
      chipCount: chips.length,
      opacities: chips.map((el) => ({
        text: el.querySelector('.milksha-num')?.textContent?.trim() || '',
        opacity: getComputedStyle(el).opacity,
        inCell: Boolean(el.closest('.milksha-num-cell')),
      })),
      animProbe: window.QMS?.runtime?.getBoardAnimProbe?.() ?? null,
    };
  });
}

function strictPass(snap) {
  const inCell = snap.opacities.filter((c) => c.inCell);
  if (inCell.length < 5) {
    return false;
  }
  return inCell.every((c) => {
    const o = parseFloat(c.opacity);
    return !Number.isFinite(o) || o >= 0.99;
  });
}

async function fiveSends(board, ctrl) {
  for (let i = 0; i < 5; i += 1) {
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
      i + 1,
      { timeout: 10000 },
    );
    await board.waitForTimeout(150);
  }
}

async function runFake() {
  await ensureCloudRunning();
  await startSite();
  await resetCloudState({ seedDevice: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await installBundledCloudRouteShim(board);
  await installBundledCloudRouteShim(ctrl);
  const base = `http://127.0.0.1:${PORT_SITE}`;
  await board.goto(`${base}/?mode=cloud&store=${STORE}&device=stb-01`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 60000 });
  await ctrl.goto(`${base}/controller/?mode=cloud&store=${STORE}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 60000 });
  await sendClearNow(ctrl);
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-board-chip').length === 0,
    undefined,
    { timeout: 30000 },
  );
  await fiveSends(board, ctrl);
  const timeline = [];
  for (const waitMs of [0, 500, 2000, 8000, 15000]) {
    if (waitMs) {
      await board.waitForTimeout(waitMs);
    }
    const snap = await sampleOpacities(board);
    timeline.push({ waitMs, snap, strictPass: strictPass(snap) });
  }
  await browser.close();
  return { mode: 'fake', store: STORE, timeline };
}

async function runLive() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(180000);
  await installLiveBranchCloudRoutes(ctx);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await board.goto(`${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=${LIVE_CLOUD_BOARD_DEVICE}`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
  await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  await ctrl.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-board-online') === '1',
    undefined,
    { timeout: 180000 },
  );
  await sendClearNow(ctrl);
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-board-chip').length === 0,
    undefined,
    { timeout: 30000 },
  );
  await fiveSends(board, ctrl);
  const timeline = [];
  for (const waitMs of [0, 500, 2000, 8000, 15000, 45000]) {
    if (waitMs) {
      await board.waitForTimeout(waitMs);
    }
    const snap = await sampleOpacities(board);
    timeline.push({ waitMs, snap, strictPass: strictPass(snap) });
  }
  await browser.close();
  return { mode: 'live', store: STORE, timeline };
}

const result = mode === 'live' ? await runLive() : await runFake();
console.log(JSON.stringify(result, null, 2));
const last = result.timeline[result.timeline.length - 1];
process.exitCode = last.strictPass ? 0 : 1;
