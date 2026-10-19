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

const STALE_S120030_SEED = () => {
  localStorage.setItem(
    'milksha:receiver-cache:s120030',
    JSON.stringify({
      seq: 99,
      numberContent: [{ source_type: 'From_Store_OK', number: '8888' }],
      businessDate: '2099-01-01',
      boardUpdatedAt: new Date().toISOString(),
    }),
  );
  localStorage.setItem(
    'milksha:local:poc-target',
    JSON.stringify({ storeId: 's120030', deviceId: 'stb-01', at: Date.now() }),
  );
};

test.describe('home board bare / URL', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('fake-cloud: / with no query shows store setup (no mode=cloud param)', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await board.goto(`${BASE}/`);
    await expect(board.locator('[data-testid="board-store-setup"]')).toBeVisible({ timeout: 20000 });
    await expect(board.locator('#board-root')).toBeHidden();
    const info = await board.evaluate(() => {
      const params = new URLSearchParams(location.search);
      return {
        modeParam: params.get('mode'),
        hasReceiverCloud: Boolean(window.receiverCloud),
      };
    });
    expect(info.modeParam).toBeNull();
    expect(info.hasReceiverCloud).toBe(false);
    await ctx.close();
  });

  test('fake-cloud: stale s120030 cache on / still shows setup; ?store=s120030 still boots', async ({
    browser,
  }) => {
    const ctx = await isolatedCloudContext(browser);
    await ctx.addInitScript(STALE_S120030_SEED);
    const board = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await board.goto(`${BASE}/`);
    await expect(board.locator('[data-testid="board-store-setup"]')).toBeVisible({ timeout: 20000 });

    await board.goto(`${BASE}/?store=s120030`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    const store = await board.evaluate(() => new URLSearchParams(location.search).get('store'));
    expect(store).toBe('s120030');
    await ctx.close();
  });

  test('fake-cloud: ?store=zz-qa-store-a boots cloud without mode param', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await board.goto(`${BASE}/?store=zz-qa-store-a`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await expect(board.locator('[data-testid="board-store-setup"]')).toBeHidden();
    await ctx.close();
  });
});
