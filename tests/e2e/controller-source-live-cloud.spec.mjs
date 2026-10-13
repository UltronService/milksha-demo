import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from './board-animation-live-setup.mjs';
import { LIVE_CLOUD_BOARD_DEVICE, LIVE_CLOUD_STORE_ID } from './live-cloud-config.mjs';
import { sendClearNow, teardownLiveCloudSession } from './live-cloud-teardown.mjs';
import { expandControllerZone } from './harness.mjs';

if (LIVE_CLOUD_STORE_ID === 'zz-qa-store-a') {
  throw new Error('Refusing zz-qa-store-a; use zz-qa-ci-store');
}

/** @type {import('playwright').Browser | undefined} */
let browser;
/** @type {import('@playwright/test').Page | undefined} */
let board;
/** @type {import('@playwright/test').Page | undefined} */
let ctrl;

async function syncLiveCloudBoard(page) {
  await page.evaluate(async function () {
    const rc = window.receiverCloud;
    if (!rc) {
      return;
    }
    if (rc.triggerDevicePoll) {
      await rc.triggerDevicePoll();
    }
    if (rc.triggerBoardPoll) {
      await rc.triggerBoardPoll({ force: true });
    }
  });
}

async function waitForBoardReadyCount(page, n) {
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    await syncLiveCloudBoard(page);
    const count = await page.evaluate(function () {
      const rt = window.QMS && window.QMS.runtime;
      if (rt && rt.getSnapshot) {
        const snap = rt.getSnapshot();
        if (snap && Array.isArray(snap.ready)) {
          return snap.ready.length;
        }
      }
      return document.querySelectorAll('.milksha-ready .milksha-num').length;
    });
    if (count >= n) {
      return;
    }
    await page.waitForTimeout(2500);
  }
  throw new Error('board ready count did not reach ' + n);
}

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

test.describe(`${LIVE_CLOUD_STORE_ID} controller push_numbers sources (live cloud)`, () => {
  test.describe.configure({ retries: 1 });

  test('POS add five sources incl. store 1234 and uber 1234 as two cells', async () => {
    test.setTimeout(480000);

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
    await board.waitForTimeout(4000);
    await expandControllerZone(ctrl, 'sec-pos');

    const sends = [
      { source: 'store', no: '1234' },
      { source: 'uber', no: '1234' },
      { source: 'point', no: '091' },
      { source: 'fp', no: '6406' },
      { source: 'udd', no: 'AB12' },
    ];

    for (let i = 0; i < sends.length; i += 1) {
      const row = sends[i];
      await ctrl.selectOption('[data-testid="fld-source"]', row.source);
      await ctrl.fill('[data-testid="fld-no"]', row.no);
      await ctrl.selectOption('[data-testid="fld-status"]', 'ready');
      await ctrl.click('[data-testid="btn-add-ticket"]');
      await waitForBoardReadyCount(board, i + 1);
    }

    await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(5, { timeout: 60000 });
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: '1234' })).toHaveCount(2);
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: '091' })).toHaveCount(1);
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: '6406' })).toHaveCount(1);
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: 'AB12' })).toHaveCount(1);

    const lastParams = await ctrl.evaluate(function () {
      const PushParams = window.QMS.Transport.PushNumbersParams;
      const tickets = window.__controller.getTickets();
      const SOURCE_OPTIONS = [
        { key: 'store', ok: 'From_Store_OK', preparing: 'From_Store_Preparing' },
        { key: 'point', ok: 'From_milksha_point_OK', preparing: 'From_milksha_point_Preparing' },
        { key: 'fp', ok: 'From_FoodPanda_OK', preparing: 'From_FoodPanda_Preparing' },
        { key: 'uber', ok: 'From_UberEat_OK', preparing: 'From_UberEat_Preparing' },
        { key: 'udd', ok: 'From_Udd_OK', preparing: 'From_Udd_Preparing' },
      ];
      function sourceDef(key) {
        for (let i = 0; i < SOURCE_OPTIONS.length; i += 1) {
          if (SOURCE_OPTIONS[i].key === key) {
            return SOURCE_OPTIONS[i];
          }
        }
        return SOURCE_OPTIONS[0];
      }
      if (!PushParams) {
        return null;
      }
      return PushParams.ticketsToPushNumbersParams(tickets, sourceDef);
    });
    expect(lastParams).toBeTruthy();
    const ready = lastParams.ready || [];
    expect(ready.length).toBe(5);
    expect(
      ready.some(function (e) {
        return e.sourceType === 'From_UberEat_OK' && e.no === '1234';
      }),
    ).toBe(true);
    expect(
      ready.some(function (e) {
        return e.sourceType === 'From_Store_OK' && e.no === '1234';
      }),
    ).toBe(true);
  });
});
