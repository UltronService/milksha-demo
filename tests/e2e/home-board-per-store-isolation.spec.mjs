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

test.describe('per-store home board isolation', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('fake-cloud: numbers on store A never appear on store B', async ({ browser }) => {
    test.setTimeout(120000);
    const ctxA = await isolatedCloudContext(browser);
    const ctxB = await isolatedCloudContext(browser);
    const boardA = await ctxA.newPage();
    const boardB = await ctxB.newPage();
    const ctrlA = await ctxA.newPage();
    const ctrlB = await ctxB.newPage();
    await installBundledCloudRouteShim(boardA);
    await installBundledCloudRouteShim(boardB);
    await installBundledCloudRouteShim(ctrlA);
    await installBundledCloudRouteShim(ctrlB);

    await boardA.goto(`${BASE}/?store=${STORE_A}`);
    await boardB.goto(`${BASE}/?store=${STORE_B}`);
    await ctrlA.goto(`${BASE}/controller/?store=${STORE_A}`);
    await ctrlB.goto(`${BASE}/controller/?store=${STORE_B}`);

    await boardA.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await boardB.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await ctrlA.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await ctrlB.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });

    await ctrlA.click('[data-testid="btn-send-numbers"]');
    await expect(boardA.locator('.milksha-ready .milksha-num').first()).toBeVisible({
      timeout: 20000,
    });
    await expect(boardB.locator('.milksha-ready .milksha-num')).toHaveCount(0, { timeout: 5000 });

    await ctrlB.click('[data-testid="btn-send-numbers"]');
    await expect(boardB.locator('.milksha-ready .milksha-num').first()).toBeVisible({
      timeout: 20000,
    });
    const countA = await boardA.locator('.milksha-ready .milksha-num').count();
    expect(countA).toBe(1);

    await ctxA.close();
    await ctxB.close();
  });
});
