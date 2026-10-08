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
const STORE = 'zz-qa-store-a';

test.describe('clear then push (stale pending clear must not wipe board)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test('fake-cloud: clear_now then push_numbers leaves numbers after device poll', async ({ browser }) => {
    test.setTimeout(90000);
    await resetCloudState({ seedDevice: true });
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    const ctrl = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(ctrl);

    await board.goto(`${BASE}/?mode=cloud&store=${STORE}`);
    await ctrl.goto(`${BASE}/controller/?mode=cloud&store=${STORE}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });

    await expandControllerZone(ctrl, 'sec-special');
    await ctrl.click('#btn-clear-now');
    await expect(ctrl.locator('#log-list li').first()).toContainText(/clear_now|清空/, { timeout: 12000 });
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num').first()).toBeVisible({ timeout: 8000 });

    await board.waitForTimeout(6500);
    await expect(board.locator('.milksha-ready .milksha-num').first()).toBeVisible({ timeout: 3000 });
    await ctx.close();
  });
});
