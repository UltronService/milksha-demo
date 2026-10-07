import { test, expect } from '@playwright/test';
import {
  restartCloud,
  startSite,
  resetCloudState,
  PORT_SITE,
  installBundledCloudRouteShim,
  isolatedCloudContext,
  expandControllerZone,
} from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

test.describe('home board cloud recovery', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('shows 離線 when network drops and clears after online', async ({ browser }) => {
    test.setTimeout(120000);
    const boardCtx = await isolatedCloudContext(browser);
    const ctrlCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    const controller = await ctrlCtx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(controller);
    await board.goto(BASE + '/');
    await controller.goto(BASE + '/controller/');
    await board.waitForFunction(() => window.QMS?.runtime?.setCloudOfflineVisible && window.receiverCloud, {
      timeout: 30000,
    });
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await controller.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num').first()).toBeVisible({
      timeout: 20000,
    });

    await board.route('https://firestore.googleapis.com/**', (route) => route.abort('failed'));
    await board.route('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**', (route) =>
      route.abort('failed'),
    );
    await expect(board.locator('#milksha-cloud-offline')).toBeVisible({ timeout: 20000 });
    await expect(board.locator('#milksha-cloud-offline')).toHaveText('離線');

    await board.unroute('https://firestore.googleapis.com/**');
    await board.unroute('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**');
    await board.evaluate(() => window.receiverCloud.scheduleCloudResync('online'));
    await expect(board.locator('#milksha-cloud-offline')).toBeHidden({ timeout: 20000 });
    await boardCtx.close();
    await ctrlCtx.close();
  });

  test('clear while board offline then empty after reconnect', async ({ browser }) => {
    test.setTimeout(120000);
    const boardCtx = await isolatedCloudContext(browser);
    const ctrlCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    const controller = await ctrlCtx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(controller);
    await board.goto(BASE + '/');
    await controller.goto(BASE + '/controller/');
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await controller.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num').first()).toBeVisible({
      timeout: 20000,
    });

    await boardCtx.setOffline(true);
    await board.waitForTimeout(2000);
    await expandControllerZone(controller, 'sec-special');
    await controller.click('[data-testid="btn-clear-now"]');
    await boardCtx.setOffline(false);
    await board.evaluate(() => window.receiverCloud.scheduleCloudResync('test'));
    await expect(board.locator('.milksha-ready .milksha-num').filter({ hasText: /\S/ })).toHaveCount(0, {
      timeout: 20000,
    });
    await boardCtx.close();
    await ctrlCtx.close();
  });

  test('store_not_allowed keeps numbers without customer 離線 badge', async ({ browser }) => {
    test.setTimeout(120000);
    const boardCtx = await isolatedCloudContext(browser);
    const ctrlCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    const controller = await ctrlCtx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(controller);
    await board.goto(BASE + '/?testAuthRecheckMs=300000');
    await controller.goto(BASE + '/controller/');
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await controller.click('[data-testid="btn-send-numbers"]');
    const firstNum = await board.locator('.milksha-ready .milksha-num').first().innerText();
    expect(firstNum.trim().length).toBeGreaterThan(0);

    let devLoginFail = false;
    await board.route('**/devLogin', async (route) => {
      if (devLoginFail) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'store_not_allowed', message: 'store not allowed' }),
        });
        return;
      }
      await route.continue();
    });
    devLoginFail = true;
    await board.evaluate(() => {
      const authKey = Object.keys(localStorage).find((k) => k.startsWith('milksha:auth:'));
      if (authKey) {
        const parsed = JSON.parse(localStorage.getItem(authKey) || '{}');
        parsed.expiresAtMs = Date.now() - 1000;
        parsed.refreshToken = '';
        localStorage.setItem(authKey, JSON.stringify(parsed));
      }
      if (typeof window.__forceReceiverAuthRecheck === 'function') {
        window.__forceReceiverAuthRecheck({ clearSession: true });
      }
    });
    await board.waitForTimeout(4000);
    await expect(board.locator('.milksha-ready .milksha-num').first()).toHaveText(firstNum.trim());
    await expect(board.locator('#milksha-cloud-offline')).toBeHidden();
    await expect(board.locator('#milksha-cloud-paused')).toBeVisible({ timeout: 8000 });
    await expect(board.locator('#milksha-cloud-paused')).toHaveText('連線暫停');
    await expect(board.locator('#board-root')).not.toHaveAttribute('data-cloud-offline', '1');
    await expect(board.locator('#board-root')).toHaveAttribute('data-cloud-paused', '1');
    await boardCtx.close();
    await ctrlCtx.close();
  });

  test('clock jump resumes sync within seconds', async ({ browser }) => {
    test.setTimeout(90000);
    const boardCtx = await isolatedCloudContext(browser);
    const ctrlCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    const controller = await ctrlCtx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(controller);
    await board.goto(BASE + '/');
    await controller.goto(BASE + '/controller/');
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await board.clock.fastForward('00:00:25');
    await board.waitForTimeout(2000);
    await controller.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num').first()).toBeVisible({ timeout: 10000 });
    await boardCtx.close();
    await ctrlCtx.close();
  });

  test('devLogin calls stay bounded over 30s polling', async ({ browser }) => {
    test.setTimeout(90000);
    const boardCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    let devLoginCalls = 0;
    await board.route('**/devLogin', async (route) => {
      devLoginCalls += 1;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'forbidden', message: 'nope' }),
      });
    });
    await installBundledCloudRouteShim(board);
    await board.goto(BASE + '/?testAuthRecheckMs=60000');
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await board.waitForTimeout(30000);
    expect(devLoginCalls).toBeLessThanOrEqual(2);
    await boardCtx.close();
  });

  test('devLogin calls stay bounded over 60s on store_not_allowed', async ({ browser }) => {
    test.setTimeout(120000);
    const boardCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    let devLoginCalls = 0;
    await board.route('**/devLogin', async (route) => {
      devLoginCalls += 1;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'store_not_allowed', message: 'store not allowed' }),
      });
    });
    await installBundledCloudRouteShim(board);
    await board.goto(BASE + '/?testAuthRecheckMs=120000');
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await board.waitForTimeout(60000);
    expect(devLoginCalls).toBeLessThanOrEqual(3);
    await boardCtx.close();
  });
});
