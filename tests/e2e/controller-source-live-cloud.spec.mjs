import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from './board-animation-live-setup.mjs';
import { LIVE_CLOUD_BOARD_DEVICE, LIVE_CLOUD_STORE_ID } from './live-cloud-config.mjs';
import { sendClearNow, teardownLiveCloudSession } from './live-cloud-teardown.mjs';

if (LIVE_CLOUD_STORE_ID === 'zz-qa-store-a') {
  throw new Error('Refusing zz-qa-store-a; use zz-qa-ci-store');
}

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

test.describe(`${LIVE_CLOUD_STORE_ID} controller quick send sources (live cloud)`, () => {
  test.describe.configure({ retries: 1 });

  test('push_numbers with sourceType shows five ready cells incl. duplicate 1234', async () => {
    test.setTimeout(360000);
    /** @type {Array<object>} */
    const pushParamsSeen = [];

    browser = await chromium.launch();
    const ctx = await browser.newContext();
    ctx.setDefaultTimeout(180000);
    await installLiveBranchCloudRoutes(ctx);
    await ctx.route('**/devCommand', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        try {
          const body = req.postDataJSON();
          if (body && body.type === 'push_numbers' && body.params) {
            pushParamsSeen.push(body.params);
          }
        } catch {
          /* ignore */
        }
      }
      await route.continue();
    });

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
    await board.waitForFunction(
      () => document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
      undefined,
      { timeout: 60000 },
    );

    const sends = [
      { source: 'store', no: '1234' },
      { source: 'uber', no: '1234' },
      { source: 'point', no: '091' },
      { source: 'fp', no: '#6406' },
      { source: 'udd', no: 'ab12' },
    ];

    for (let i = 0; i < sends.length; i += 1) {
      const row = sends[i];
      await ctrl.selectOption('[data-testid="fld-quick-source"]', row.source);
      await ctrl.fill('[data-testid="fld-quick-no"]', row.no);
      await ctrl.click('[data-testid="btn-send-numbers"]');
      await board.waitForFunction(
        (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
        i + 1,
        { timeout: 120000 },
      );
    }

    await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(5, { timeout: 30000 });
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: '1234' })).toHaveCount(2);
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: '091' })).toHaveCount(1);
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: '6406' })).toHaveCount(1);
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: 'AB12' })).toHaveCount(1);

    expect(pushParamsSeen.length).toBeGreaterThan(0);
    const last = pushParamsSeen[pushParamsSeen.length - 1];
    const ready = Array.isArray(last.ready) ? last.ready : [];
    expect(ready.length).toBeGreaterThanOrEqual(5);
    const uberEntry = ready.find(
      (e) => typeof e === 'object' && e && e.sourceType === 'From_UberEat_OK' && e.no === '1234',
    );
    const storeEntry = ready.find(
      (e) => typeof e === 'object' && e && e.sourceType === 'From_Store_OK' && e.no === '1234',
    );
    expect(uberEntry).toBeTruthy();
    expect(storeEntry).toBeTruthy();
  });
});
