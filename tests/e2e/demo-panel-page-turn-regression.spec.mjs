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

test.describe('demo page-turn + mutation regression (video 2/2 blank)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('page turn interrupted by demo clear/push stays visible with valid page index', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
    await installBundledCloudRouteShim(page);
    await page.goto(
      `${BASE}/?mode=cloud&store=zz-qa-store-a&motion=on&demo=1&testPageIntervalMs=40&device=stb-01`,
    );
    await page.waitForFunction(() => window.QMS && window.QMS.runtime, undefined, { timeout: 45000 });
    await page.locator('.milksha-demo-handle').click();

    for (let i = 0; i < 14; i += 1) {
      await page.locator('#ms-demo-add').dispatchEvent('click');
    }

    await page.waitForTimeout(50);
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
    await page.locator('#ms-demo-clear').dispatchEvent('click');
    await page.locator('#ms-demo-push').dispatchEvent('click');
    for (let j = 0; j < 8; j += 1) {
      await page.locator('#ms-demo-add').dispatchEvent('click');
      await page.locator('#ms-demo-push').dispatchEvent('click');
    }
    await page.waitForTimeout(120);

    const health = await page.evaluate(() => window.QMS.runtime.getBoardPresentationHealth());
    const modelTotal = health.modelPrep + health.modelReady;
    expect(modelTotal).toBeGreaterThan(0);
    expect(health.visibleChips).toBeGreaterThan(0);
    if (modelTotal > 0 && health.prepIndicator) {
      const m = health.prepIndicator.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (m) {
        const pageNum = Number(m[1]);
        const pages = Number(m[2]);
        expect(pageNum).toBeLessThanOrEqual(pages);
      }
    }
  });

  test('auto page interval with rapid demo spam does not leave zero visible chips', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
    await installBundledCloudRouteShim(page);
    await page.goto(
      `${BASE}/?mode=cloud&store=zz-qa-store-a&motion=on&demo=1&testPageIntervalMs=35&device=stb-01`,
    );
    await page.waitForFunction(() => window.QMS && window.QMS.runtime, undefined, { timeout: 45000 });
    await page.locator('.milksha-demo-handle').click();

    const end = Date.now() + 8000;
    let i = 0;
    while (Date.now() < end) {
      const sel = i % 4 === 0 ? '#ms-demo-clear' : '#ms-demo-push';
      await page.locator(sel).dispatchEvent('click');
      if (i % 3 === 0) {
        await page.locator('#ms-demo-add').dispatchEvent('click');
      }
      i += 1;
      await page.waitForTimeout(30);
      const health = await page.evaluate(() => window.QMS.runtime.getBoardPresentationHealth());
      const modelTotal = health.modelPrep + health.modelReady;
      if (modelTotal > 0) {
        expect(health.visibleChips, `iteration ${i} model=${modelTotal}`).toBeGreaterThan(0);
      }
    }
  });
});
