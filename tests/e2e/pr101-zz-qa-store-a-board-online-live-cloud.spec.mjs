import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';
import { join } from 'node:path';
import {
  installPr101SiteRoute,
  sampleControllerDbg,
  PR101_STORE,
  PR101_DEVICE,
} from '../../artifacts/pr101-diag/pr101-diag-lib.mjs';
import { GITHUB_PAGES_BASE } from './board-animation-live-setup.mjs';
import { teardownLiveCloudSession } from './live-cloud-teardown.mjs';

const STORE = PR101_STORE;
const WAIT_MS = Number(process.env.PR101_WAIT_BOARD_ONLINE_MS || 120000);

/** @type {import('playwright').Browser | undefined} */
let browser;
/** @type {import('@playwright/test').Page | undefined} */
let board;
/** @type {import('@playwright/test').Page | undefined} */
let ctrl;

test.afterEach(async () => {
  try {
    await teardownLiveCloudSession(ctrl, board);
  } finally {
    if (browser) {
      await browser.close();
    }
    browser = undefined;
    board = undefined;
    ctrl = undefined;
  }
});

test.describe('PR101 zz-qa-store-a board online indicator (live cloud)', () => {
  test('controller data-board-online becomes 1 while guest board heartbeats', async () => {
    test.setTimeout(300000);
    if (STORE !== 'zz-qa-store-a') {
      throw new Error('Refusing store other than zz-qa-store-a');
    }

    browser = await chromium.launch();
    const ctx = await browser.newContext();
    ctx.setDefaultTimeout(180000);
    await installPr101SiteRoute(ctx, join(process.cwd()));

    board = await ctx.newPage();
    ctrl = await ctx.newPage();

    await board.goto(
      `${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=${PR101_DEVICE}`,
    );
    await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
    await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });

    const deadline = Date.now() + WAIT_MS;
    let last = null;
    while (Date.now() < deadline) {
      last = await sampleControllerDbg(ctrl);
      if (last.boardOnline === '1') {
        break;
      }
      await ctrl.waitForTimeout(3000);
    }

    expect(last, 'board online samples').toBeTruthy();
    expect(last.boardOnline, JSON.stringify(last)).toBe('1');
  });
});
