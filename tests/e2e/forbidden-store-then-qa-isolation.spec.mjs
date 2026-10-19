import { test, expect } from '@playwright/test';
import {
  PORT_SITE,
  clickControllerDevButtonByTestId,
  installBundledCloudRouteShim,
  resetCloudState,
  restartCloud,
  startSite,
} from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE_A = 'zz-qa-store-a';
const STORE_B = 'zz-qa-store-b';

function isBoxHeartbeatOk(res) {
  return res.request().method() === 'POST' && res.url().includes('boxHeartbeat') && res.status() === 200;
}

/** Wait for a real boxHeartbeat HTTP 200 from this board tab (no extra timeout beyond response wait). */
async function waitForRealBoardBoxHeartbeat(board) {
  await board.waitForFunction(
    () => typeof window.receiverCloud?.sendHeartbeat === 'function',
    undefined,
    { timeout: 30000 },
  );
  const heartbeatDone = board.waitForResponse(isBoxHeartbeatOk, { timeout: 30000 });
  await board.evaluate(() => window.receiverCloud.sendHeartbeat());
  await heartbeatDone;
}

async function waitBoardCloudReady(board) {
  await board.waitForFunction(
    () => typeof window.receiverCloud?.sendHeartbeat === 'function',
    undefined,
    { timeout: 30000 },
  );
  await expect(board.locator('#milksha-cloud-paused')).toBeHidden({ timeout: 30000 });
}

async function waitControllerOutboundReady(ctrl) {
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 60000 });
  await expect(ctrl.locator('[data-testid="btn-send-numbers-block-reason"]')).toBeHidden({ timeout: 60000 });
  await expect(ctrl.locator('[data-testid="btn-send-numbers"]')).toBeEnabled({ timeout: 60000 });
}

test.describe('forbidden store then zz-qa isolation (same browser context)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('zz-deny-test 連線暫停 does not block zz-qa-store-a/b sends', async ({ browser }) => {
    test.setTimeout(180000);
    const ctx = await browser.newContext();
    const denied = await ctx.newPage();
    await installBundledCloudRouteShim(denied);
    await denied.route('**/devLogin', async (route) => {
      const body = route.request().postData() || '';
      if (!body.includes('zz-deny-test')) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'store_not_allowed', message: 'store not allowed' }),
      });
    });
    await denied.goto(`${BASE}/?mode=cloud&store=zz-deny-test`);
    await expect(denied.locator('#milksha-cloud-paused')).toHaveText('連線暫停', { timeout: 60000 });
    await denied.close();

    const wipe = await ctx.newPage();
    await wipe.goto(`${BASE}/`);
    await wipe.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await wipe.close();

    const boardA = await ctx.newPage();
    const boardB = await ctx.newPage();
    await installBundledCloudRouteShim(boardA);
    await installBundledCloudRouteShim(boardB);
    await boardA.goto(`${BASE}/?mode=cloud&store=${STORE_A}`);
    await boardB.goto(`${BASE}/?mode=cloud&store=${STORE_B}`);
    await waitBoardCloudReady(boardA);
    await waitBoardCloudReady(boardB);
    await waitForRealBoardBoxHeartbeat(boardA);
    await waitForRealBoardBoxHeartbeat(boardB);

    const ctrlA = await ctx.newPage();
    await installBundledCloudRouteShim(ctrlA);
    await ctrlA.goto(`${BASE}/controller/?mode=cloud&store=${STORE_A}`);
    await waitControllerOutboundReady(ctrlA);

    await clickControllerDevButtonByTestId(ctrlA, 'btn-send-numbers');
    await expect(boardA.locator('.milksha-ready .milksha-num').first()).toBeVisible({ timeout: 45000 });
    await expect(boardB.locator('.milksha-ready .milksha-num')).toHaveCount(0, { timeout: 10000 });

    const ctrlB = await ctx.newPage();
    await installBundledCloudRouteShim(ctrlB);
    await ctrlB.goto(`${BASE}/controller/?mode=cloud&store=${STORE_B}`);
    await waitForRealBoardBoxHeartbeat(boardB);
    await waitControllerOutboundReady(ctrlB);

    await clickControllerDevButtonByTestId(ctrlB, 'btn-send-numbers');
    await expect(boardB.locator('.milksha-ready .milksha-num').first()).toBeVisible({ timeout: 45000 });
    await ctx.close();
  });
});
