import { test, expect } from '@playwright/test';
import {
  restartCloud,
  startSite,
  resetCloudState,
  PORT_SITE,
  PORT_CLOUD,
  installBundledCloudRouteShim,
  isolatedCloudContext,
  expandControllerZone,
} from './harness.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const ART = join(process.cwd(), 'artifacts', 'store-picker-self-qa', 'e2e');

test.describe('controller cloud store picker', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('403: invalid store id format shows 店號格式不對 and blocks send', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/controller/?mode=cloud&store=BadStore`);
    await expandControllerZone(page, 'sec-connect');
    const banner = page.locator('[data-testid="store-not-allowed-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('店號格式不對');
    await expect(page.locator('[data-testid="btn-send-numbers"]')).toBeDisabled();
    let devLoginCalls = 0;
    await page.route('**/devLogin', async (route) => {
      devLoginCalls += 1;
      await route.continue();
    });
    await page.waitForTimeout(3000);
    expect(devLoginCalls).toBe(0);
    await ctx.close();
  });

  test('403: unregistered store shows board-first hint and blocks send', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/controller/?mode=cloud&store=q888888`);
    await expandControllerZone(page, 'sec-connect');
    const banner = page.locator('[data-testid="store-not-allowed-banner"]');
    await expect(banner).toBeVisible({ timeout: 20000 });
    await expect(banner).toContainText('這家店還沒有看板連線過');
    await expect(page.locator('[data-testid="btn-send-numbers"]')).toBeDisabled();
    await ctx.close();
  });

  test('403: registry full message from devLogin', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.route('**/devLogin', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'dev_store_registry_full', message: 'registry full' }),
      });
    });
    await page.goto(`${BASE}/controller/?mode=cloud&store=c030020`);
    await expandControllerZone(page, 'sec-connect');
    const banner = page.locator('[data-testid="store-not-allowed-banner"]');
    await expect(banner).toBeVisible({ timeout: 20000 });
    await expect(banner).toContainText('名額已滿');
    await ctx.close();
  });

  test('new store appears within poll window after board heartbeat', async ({ browser }) => {
    test.setTimeout(120000);
    const newStore = 'a777777';
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    const controller = await ctx.newPage();
    await installBundledCloudRouteShim(controller);
    await controller.goto(
      `${BASE}/controller/?mode=cloud&store=c030020&testStoreListPollMs=2000`,
    );
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    await board.goto(`${BASE}/?mode=cloud&store=${newStore}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await expandControllerZone(controller, 'sec-connect');
    await expect
      .poll(
        async () => {
          await controller.evaluate(() => window.__controller.refreshStoreListFromCloud());
          const values = await controller.locator('#fld-store option').evaluateAll((opts) =>
            opts.map((o) => o.value),
          );
          return values.includes(newStore);
        },
        { timeout: 35000 },
      )
      .toBe(true);
    await ctx.close();
  });

  test('switching store waits for heartbeat before send', async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await isolatedCloudContext(browser);
    const boardA = await ctx.newPage();
    await installBundledCloudRouteShim(boardA);
    await boardA.goto(`${BASE}/?mode=cloud&store=c030020`);
    await boardA.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    const controller = await ctx.newPage();
    await installBundledCloudRouteShim(controller);
    await controller.goto(`${BASE}/controller/?mode=cloud&store=c030020`);
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 20000 });
    await expandControllerZone(controller, 'sec-connect');
    await controller.selectOption('#fld-store', 's120030');
    await controller.waitForTimeout(500);
    await expect(controller.locator('#online-state')).not.toContainText('在線');
    await expect(controller.locator('[data-testid="btn-send-numbers"]')).toBeDisabled();
    const boardB = await ctx.newPage();
    await installBundledCloudRouteShim(boardB);
    await boardB.goto(`${BASE}/?mode=cloud&store=s120030`);
    await boardB.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 30000 });
    await ctx.close();
  });

  test('store list polling does not increase devLogin after boot', async ({ browser }) => {
    test.setTimeout(180000);
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    let devLoginCalls = 0;
    await page.route('**/devLogin', async (route) => {
      devLoginCalls += 1;
      await route.continue();
    });
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/controller/?mode=cloud&store=zz-qa-store-a&testStoreListPollMs=2000`);
    await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    const bootCount = devLoginCalls;
    await page.waitForTimeout(10000);
    expect(devLoginCalls).toBe(bootCount);
    await ctx.close();
  });

  test('listStores error keeps current store options', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/controller/?mode=cloud&store=c030020`);
    await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    await page.route('**/listStores', async (route) => {
      await route.fulfill({ status: 503, body: 'down' });
    });
    await page.evaluate(() => window.__controller.refreshStoreListFromCloud());
    await expandControllerZone(page, 'sec-connect');
    const hint = page.locator('[data-testid="store-list-fetch-hint"]');
    await expect(hint).toBeVisible();
    const values = await page.locator('#fld-store option').evaluateAll((opts) => opts.map((o) => o.value));
    expect(values.includes('c030020')).toBe(true);
    mkdirSync(ART, { recursive: true });
    await page.screenshot({ path: join(ART, 'store-list-error-hint.png'), fullPage: false });
    await ctx.close();
  });
});
