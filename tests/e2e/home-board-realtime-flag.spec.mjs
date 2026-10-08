import { test, expect } from '@playwright/test';
import { restartCloud, startSite, resetCloudState, PORT_SITE, installBundledCloudRouteShim, isolatedCloudContext } from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

test.describe('realtime=0 forces poll mode', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('?realtime=0 disables boardListen', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    await ctx.addInitScript(() => {
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: 'milksha-qms-dev',
          apiKey: 'fake-api-key-for-emulator',
          region: 'asia-east1',
        }),
      );
    });
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/?mode=cloud&store=zz-qa-store-a&device=stb-01&realtime=0`);
    await page.waitForFunction(() => window.receiverCloud && window.receiverCloud.getRealtimeStats, {
      timeout: 30000,
    });
    const stats = await page.evaluate(() => window.receiverCloud.getRealtimeStats());
    expect(stats.realtimeDisabled).toBe(true);
    expect(stats.boardListen).toBe(false);
    await ctx.close();
  });
});
