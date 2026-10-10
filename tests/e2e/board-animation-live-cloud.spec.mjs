import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from './board-animation-live-setup.mjs';
import { waitForReadyBoardAnimSettled } from './board-animation-helpers.mjs';
import { LIVE_CLOUD_BOARD_DEVICE, LIVE_CLOUD_STORE_ID } from './live-cloud-config.mjs';
import { sendClearNow, teardownLiveCloudSession } from './live-cloud-teardown.mjs';

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

test.describe(`${LIVE_CLOUD_STORE_ID} live cloud with branch site route`, () => {
  test.describe.configure({ retries: 2 });

  test('five sends within 3s and board animates', async () => {
    test.setTimeout(360000);
    browser = await chromium.launch();
    const ctx = await browser.newContext();
    ctx.setDefaultTimeout(180000);
    await installLiveBranchCloudRoutes(ctx);
    board = await ctx.newPage();
    ctrl = await ctx.newPage();
    const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${LIVE_CLOUD_STORE_ID}`);
    await board.goto(
      `${GITHUB_PAGES_BASE}/?mode=cloud&store=${LIVE_CLOUD_STORE_ID}&device=${LIVE_CLOUD_BOARD_DEVICE}`,
    );
    await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
    await ctrlNav;
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
    await ctrl.waitForFunction(
      () => document.getElementById('online-state')?.getAttribute('data-board-online') === '1',
      undefined,
      { timeout: 180000 },
    );
    await sendClearNow(ctrl);
    const times = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = Date.now();
      await ctrl.click('[data-testid="btn-send-numbers"]');
      await board.waitForFunction(
        (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
        i + 1,
        { timeout: 3000 },
      );
      times.push(Date.now() - t0);
      await board.waitForTimeout(150);
    }
    for (let i = 0; i < times.length; i += 1) {
      expect(times[i]).toBeLessThanOrEqual(3000);
    }
    await waitForReadyBoardAnimSettled(board, 5, 15000);
  });
});
