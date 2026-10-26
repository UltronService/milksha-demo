import { test, expect } from '@playwright/test';
import {
  PORT_SITE,
  PORT_CLOUD,
  installBundledCloudRouteShim,
  restartCloud,
  resetCloudState,
  startSite,
} from './harness.mjs';
import { blockNonLocalNetwork } from './helpers/block-non-local-network.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

test.describe('demo=1 cloud apply guard', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('demo=1 keeps demo numbers when fake cloud board is cleared and resync runs', async ({
    page,
  }) => {
    await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
    await installBundledCloudRouteShim(page);
    await page.goto(
      `${BASE}/?mode=cloud&store=zz-qa-store-a&motion=on&demo=1&device=stb-01`,
    );
    await page.waitForFunction(() => window.QMS && window.QMS.runtime, undefined, { timeout: 45000 });
    await page.locator('.milksha-demo-handle').click();
    for (let i = 0; i < 6; i += 1) {
      await page.locator('#ms-demo-add').dispatchEvent('click');
    }
    const before = await page.evaluate(() => window.QMS.runtime.getBoardPresentationHealth());
    expect(before.modelPrep + before.modelReady).toBeGreaterThanOrEqual(6);

    await page.evaluate(async () => {
      const rc = window.receiverCloud;
      if (rc && typeof rc.scheduleCloudResync === 'function') {
        await rc.scheduleCloudResync('e2e_empty_board');
      }
    });
    await page.waitForTimeout(800);

    const after = await page.evaluate(() => window.QMS.runtime.getBoardPresentationHealth());
    expect(after.modelPrep + after.modelReady).toBeGreaterThanOrEqual(6);
    expect(after.visibleChips).toBeGreaterThan(0);
  });

  test('without demo=1 cloud resync can clear visible board', async ({ page }) => {
    await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/?mode=cloud&store=zz-qa-store-a&motion=on&device=stb-01`);
    await page.waitForFunction(() => window.receiverCloud, undefined, { timeout: 45000 });
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload(
        [
          { source_type: 'From_Store_Preparing', number: '1001' },
          { source_type: 'From_Store_OK', number: '1002' },
        ],
        { silent: true },
      );
    });
    const seeded = await page.evaluate(() => window.QMS.runtime.getBoardPresentationHealth());
    expect(seeded.visibleChips).toBeGreaterThan(0);

    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([], { silent: true });
    });

    const cleared = await page.evaluate(() => window.QMS.runtime.getBoardPresentationHealth());
    expect(cleared.modelPrep + cleared.modelReady).toBe(0);
    expect(cleared.visibleChips).toBe(0);
  });
});
