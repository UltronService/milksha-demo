import { test, expect } from '@playwright/test';
import {
  restartCloud,
  resetCloudState,
  startSite,
  PORT_SITE,
  installBundledCloudRouteShim,
  isolatedCloudContext,
} from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

test.describe('controller cloud auth warm', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('auto-connect uses at most two devLogin calls (warm + connect)', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const controller = await ctx.newPage();
    let devLoginCalls = 0;
    await controller.route('**/devLogin', async (route) => {
      devLoginCalls += 1;
      await route.continue();
    });
    await installBundledCloudRouteShim(controller);
    await controller.goto(`${BASE}/controller/?mode=cloud&store=zz-qa-store-a`);
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    await controller.waitForTimeout(2000);
    expect(devLoginCalls).toBeLessThanOrEqual(2);
    await ctx.close();
  });
});
