import { test, expect } from '@playwright/test';
import {
  restartCloud,
  startSite,
  resetCloudState,
  PORT_SITE,
  installBundledCloudRouteShim,
  isolatedCloudContext,
} from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE = 'zz-qa-store-a';

test.describe('fresh browser 連線暫停 with existing session', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('boxHeartbeat 403 store_not_allowed shows pause without new devLogin', async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await board.goto(`${BASE}/?mode=cloud&store=${STORE}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await board.waitForFunction(
      () => Object.keys(localStorage).some((k) => k.startsWith('milksha:auth:')),
      { timeout: 30000 },
    );

    let devLoginCalls = 0;
    await board.route('**/devLogin', async (route) => {
      devLoginCalls += 1;
      await route.continue();
    });
    await board.route('**/boxHeartbeat', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'store_not_allowed', message: 'store not allowed' }),
      });
    });

    await board.evaluate(() => {
      if (window.receiverCloud && window.receiverCloud.sendHeartbeat) {
        return window.receiverCloud.sendHeartbeat();
      }
      return null;
    });
    await expect(board.locator('#milksha-cloud-paused')).toBeVisible({ timeout: 15000 });
    await expect(board.locator('#milksha-cloud-paused')).toHaveText('連線暫停');
    expect(devLoginCalls).toBe(0);
    await ctx.close();
  });
});
