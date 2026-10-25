import { test, expect } from '@playwright/test';
import { PORT_SITE, clickControllerDevButton, clickControllerDevButtonByTestId, installBundledCloudRouteShim, resetCloudState, restartCloud, startSite } from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE_A = 'zz-qa-store-a';
const STORE_B = 'zz-qa-store-b';

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
    const scrubStorage = await ctx.newPage();
    await scrubStorage.goto('about:blank');
    await scrubStorage.evaluate(() => {
      try {
        const remove = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (key.indexOf('milksha:auth:devlogin-peer:') === 0 || key.indexOf(':zz-deny-') >= 0) {
            remove.push(key);
          }
        }
        remove.forEach((k) => localStorage.removeItem(k));
      } catch {
        /* ignore */
      }
    });
    await scrubStorage.close();

    const boardA = await ctx.newPage();
    const boardB = await ctx.newPage();
    const ctrlA = await ctx.newPage();
    const ctrlB = await ctx.newPage();
    for (const p of [boardA, boardB, ctrlA, ctrlB]) {
      await installBundledCloudRouteShim(p);
    }
    const devA = 'stb-a';
    const devB = 'stb-b';
    await boardA.goto(`${BASE}/?mode=cloud&store=${STORE_A}&device=${devA}`);
    await boardB.goto(`${BASE}/?mode=cloud&store=${STORE_B}&device=${devB}`);
    await boardA.bringToFront();
    await boardB.bringToFront();
    await ctrlA.goto(`${BASE}/controller/?mode=cloud&store=${STORE_A}&device=${devA}`);
    await ctrlB.goto(`${BASE}/controller/?mode=cloud&store=${STORE_B}&device=${devB}`);
    await boardA.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 30000 });
    await boardB.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 30000 });
    await expect(boardA.locator('#milksha-cloud-paused')).toBeHidden({ timeout: 30000 });
    await ctrlA.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    await ctrlB.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    await expect(ctrlA.locator('#online-state')).toContainText('在線', { timeout: 90000 });
    await expect(ctrlB.locator('#online-state')).toContainText('在線', { timeout: 90000 });
    await clickControllerDevButtonByTestId(ctrlA, 'btn-send-numbers');
    await expect(boardA.locator('.milksha-ready .milksha-num').first()).toBeVisible({ timeout: 45000 });
    await expect(boardB.locator('.milksha-ready .milksha-num')).toHaveCount(0);
    await clickControllerDevButtonByTestId(ctrlB, 'btn-send-numbers');
    await expect(boardB.locator('.milksha-ready .milksha-num').first()).toBeVisible({ timeout: 45000 });
    await ctx.close();
  });
});
