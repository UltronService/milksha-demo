#!/usr/bin/env node
/**
 * Compare opacity wait assertions on the same main-tree board code.
 *   main  — matches main spec (all .milksha-board-chip, 2-arg timeout → 180s effective)
 *   pr43  — matches f5f62cb (in-cell non-float, opacity==='1'|'', 30s, 3-arg)
 *
 * Usage:
 *   node scripts/fade-stuck-assertion-matrix.mjs --mode fake --runs 5
 *   LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-assertion-matrix.mjs --mode live --runs 5
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
import { sendClearNow, teardownLiveCloudSession } from '../tests/e2e/live-cloud-teardown.mjs';

const STORE = String(process.env.LIVE_CLOUD_STORE_ID || LIVE_CLOUD_STORE_ID || 'zz-qa-ci-store').trim();
const modeArg = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'fake';
const runsArg = process.argv.includes('--runs') ? Number(process.argv[process.argv.indexOf('--runs') + 1]) : 5;
const RUNS = Number.isFinite(runsArg) && runsArg > 0 ? runsArg : 5;

/** @param {'main'|'pr43'} kind */
function opacityPageFn(kind) {
  if (kind === 'main') {
    return () =>
      [...document.querySelectorAll('.milksha-board-chip')].every((el) => {
        const o = getComputedStyle(el).opacity;
        return o === '1' || o === '';
      });
  }
  return () => {
    const chips = [
      ...document.querySelectorAll('.milksha-board-chip:not(.milksha-board-chip--layer-float)'),
    ].filter((el) => el.closest('.milksha-num-cell'));
    return chips.every((el) => {
      const o = getComputedStyle(el).opacity;
      return o === '1' || o === '';
    });
  };
}

/** @param {import('@playwright/test').Page} board @param {'main'|'pr43'} kind */
async function waitOpacityAssert(board, kind) {
  const fn = opacityPageFn(kind);
  if (kind === 'main') {
    await board.waitForFunction(fn, { timeout: 15000 });
    return { effectiveTimeoutMs: 180000, label: 'main-2arg-15000-nominal' };
  }
  await board.waitForFunction(fn, undefined, { timeout: 30000 });
  return { effectiveTimeoutMs: 30000, label: 'pr43-f5f62cb-in-cell-30s' };
}

async function fiveSends(board, ctrl) {
  for (let i = 0; i < 5; i += 1) {
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
      i + 1,
      { timeout: 3000 },
    );
    await board.waitForTimeout(150);
  }
}

async function connectLive(ctx) {
  await installLiveBranchCloudRoutes(ctx);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await board.goto(`${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=${LIVE_CLOUD_BOARD_DEVICE}`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 180000 });
  await ctrlNav;
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  return { board, ctrl };
}

async function connectFake(ctx) {
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await installBundledCloudRouteShim(board);
  await installBundledCloudRouteShim(ctrl);
  const base = `http://127.0.0.1:${PORT_SITE}`;
  await board.goto(`${base}/?mode=cloud&store=${STORE}&device=stb-01`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 60000 });
  await ctrl.goto(`${base}/controller/?mode=cloud&store=${STORE}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 60000 });
  return { board, ctrl };
}

/** @param {'main'|'pr43'} assertKind */
async function oneRun(assertKind) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(180000);
  let board;
  let ctrl;
  const t0 = Date.now();
  try {
    if (modeArg === 'live') {
      ({ board, ctrl } = await connectLive(ctx));
    } else {
      await ensureCloudRunning();
      await startSite();
      await resetCloudState({ seedDevice: true });
      ({ board, ctrl } = await connectFake(ctx));
    }
    await fiveSends(board, ctrl);
    const meta = await waitOpacityAssert(board, assertKind);
    return {
      assertKind,
      pass: true,
      elapsedMs: Date.now() - t0,
      ...meta,
    };
  } catch (err) {
    const snap = board
      ? await board.evaluate(() => ({
          readyNums: document.querySelectorAll('.milksha-ready .milksha-num').length,
          allChips: [...document.querySelectorAll('.milksha-board-chip')].map((el) => ({
            opacity: getComputedStyle(el).opacity,
            float: el.classList.contains('milksha-board-chip--layer-float'),
            inCell: Boolean(el.closest('.milksha-num-cell')),
          })),
        }))
      : null;
    return {
      assertKind,
      pass: false,
      elapsedMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
      snap,
    };
  } finally {
    try {
      await teardownLiveCloudSession(ctrl, board);
    } catch {
      /* ignore */
    }
    await browser.close();
  }
}

async function runMatrix(assertKind) {
  const results = [];
  for (let i = 0; i < RUNS; i += 1) {
    results.push(await oneRun(assertKind));
  }
  const fails = results.filter((r) => !r.pass).length;
  return { assertKind, runs: RUNS, fails, passes: RUNS - fails, results };
}

const mainBlock = await runMatrix('main');
const pr43Block = await runMatrix('pr43');

const out = {
  store: STORE,
  mode: modeArg,
  boardCode: 'main-workspace',
  gitHead: process.env.GIT_HEAD || null,
  mainAssertion: mainBlock,
  pr43Assertion: pr43Block,
};

console.log(JSON.stringify(out, null, 2));
