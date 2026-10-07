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
const STORE_A = 'zz-qa-store-a';
const STORE_B = 'zz-qa-store-b';

const LEGACY_SEED = () => {
  if (localStorage.getItem('__legacy_seed_once')) {
    return;
  }
  localStorage.setItem('__legacy_seed_once', '1');
  localStorage.setItem('milksha:deviceId', 'stb-old-99');
  localStorage.setItem(
    'milksha:cloud-settings',
    JSON.stringify({
      projectId: 'milksha-qms-dev',
      apiKey: 'legacy-key',
      accessCode: 'legacy-code',
      region: 'asia-east1',
    }),
  );
  localStorage.setItem(
    'milksha:local:poc-target',
    JSON.stringify({ storeId: 's120030', deviceId: 'stb-01', pinnedAt: Date.now() }),
  );
  localStorage.setItem(
    'milksha:receiver-cache:s120030',
    JSON.stringify({ seq: 9999, numberContent: [{ number: '9999' }], businessDate: '2099-01-01' }),
  );
};

test.describe('per-store switch in one browser', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('fake-cloud: switching ?store= A to B does not show stale A numbers on B', async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    const controller = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(controller);

    await board.goto(`${BASE}/?mode=cloud&store=${STORE_A}`);
    await controller.goto(`${BASE}/controller/?mode=cloud&store=${STORE_A}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await controller.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num').first()).toBeVisible({
      timeout: 45000,
    });
    const numA = (await board.locator('.milksha-ready .milksha-num').first().innerText()).trim();

    await board.goto(`${BASE}/?mode=cloud&store=${STORE_B}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(0, { timeout: 8000 });

    await controller.goto(`${BASE}/controller/?mode=cloud&store=${STORE_B}`);
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await controller.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(1, { timeout: 45000 });

    await board.goto(`${BASE}/?mode=cloud&store=${STORE_A}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await expect(board.locator('.milksha-ready .milksha-num').first()).toHaveText(numA, {
      timeout: 20000,
    });
    await ctx.close();
  });

  test('legacy-key seed: switching ?store= A to B does not show stale A numbers on B', async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await browser.newContext();
    await ctx.addInitScript(LEGACY_SEED);
    const board = await ctx.newPage();
    const controller = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(controller);

    await board.goto(`${BASE}/?mode=cloud&store=${STORE_A}`);
    await controller.goto(`${BASE}/controller/?mode=cloud&store=${STORE_A}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await controller.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num').first()).toBeVisible({
      timeout: 45000,
    });

    await board.goto(`${BASE}/?mode=cloud&store=${STORE_B}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(0, { timeout: 8000 });
    await ctx.close();
  });
});
