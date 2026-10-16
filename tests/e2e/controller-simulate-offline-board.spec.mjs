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

test.describe('controller simulate_offline on guest board', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('模擬斷網 shows 離線 on board and restore clears it', async ({ browser }) => {
    test.setTimeout(120000);
    const boardCtx = await isolatedCloudContext(browser);
    const ctrlCtx = await isolatedCloudContext(browser);
    const board = await boardCtx.newPage();
    const controller = await ctrlCtx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(controller);
    await board.goto(`${BASE}/`);
    await controller.goto(`${BASE}/controller/`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await controller.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num').first()).toBeVisible({ timeout: 20000 });

    await expandControllerZone(controller, 'sec-net');
    await controller.click('[data-testid="btn-offline"]');
    await expect(board.locator('#milksha-cloud-offline')).toBeVisible({ timeout: 15000 });
    await controller.click('[data-testid="btn-restore"]');
    await expect(board.locator('#milksha-cloud-offline')).toBeHidden({ timeout: 15000 });
    await boardCtx.close();
    await ctrlCtx.close();
  });
});
