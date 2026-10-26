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

test.describe('demo clear + rapid add regressions (owner video)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('first 清空畫面 removes page indicator (1/2) with numbers', async ({ page }) => {
    test.setTimeout(120000);
    await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
    await installBundledCloudRouteShim(page);
    await page.goto(
      `${BASE}/?mode=cloud&store=zz-qa-store-a&motion=on&demo=1&testPageIntervalMs=60000&device=stb-01`,
    );
    await page.waitForFunction(() => window.QMS && window.QMS.runtime, undefined, { timeout: 45000 });
    await page.locator('.milksha-demo-handle').click();

    for (let i = 0; i < 14; i += 1) {
      await page.locator('#ms-demo-add').dispatchEvent('click');
    }

    await page.evaluate(async () => {
      await window.QMS.runtime.advanceZonePageForTest('prep');
    });

    await expect(page.locator('.milksha-zone.milksha-prep .milksha-pg-indicator')).toHaveText(
      /2\s*\/\s*2/,
      { timeout: 10000 },
    );
    const chipsBefore = await page.evaluate(
      () => window.QMS.runtime.getBoardPresentationHealth().visibleChips,
    );
    expect(chipsBefore).toBeGreaterThan(0);

    await page.locator('#ms-demo-clear').dispatchEvent('click');
    await page.waitForTimeout(400);

    const afterOneClear = await page.evaluate(() => {
      const health = window.QMS.runtime.getBoardPresentationHealth();
      const indicators = document.querySelectorAll('.milksha-pg-indicator');
      return {
        modelTotal: health.modelPrep + health.modelReady,
        visibleChips: health.visibleChips,
        prepIndicator: health.prepIndicator,
        indicatorCount: indicators.length,
      };
    });
    expect(afterOneClear.modelTotal).toBe(0);
    expect(afterOneClear.visibleChips).toBe(0);
    expect(afterOneClear.indicatorCount).toBe(0);
    expect(afterOneClear.prepIndicator).toBeFalsy();
  });

  test('rapid add (~300ms) does not stack multiple chips in one cell', async ({ page }) => {
    test.setTimeout(120000);
    await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
    await installBundledCloudRouteShim(page);
    await page.goto(
      `${BASE}/?mode=cloud&store=zz-qa-store-a&motion=on&demo=1&testPageIntervalMs=60000&device=stb-01`,
    );
    await page.waitForFunction(() => window.QMS && window.QMS.runtime, undefined, { timeout: 45000 });
    await page.locator('.milksha-demo-handle').click();

    for (let i = 0; i < 10; i += 1) {
      await page.locator('#ms-demo-add').dispatchEvent('click');
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(500);

    const overlap = await page.evaluate(() => {
      let maxPerCell = 0;
      document.querySelectorAll('.milksha-num-cell').forEach((cell) => {
        const chips = cell.querySelectorAll(
          '.milksha-board-chip:not(.milksha-board-chip--layer-float)',
        );
        if (chips.length > maxPerCell) {
          maxPerCell = chips.length;
        }
      });
      const floats = document.querySelectorAll('.milksha-board-chip--layer-float').length;
      const health = window.QMS.runtime.getBoardPresentationHealth();
      return { maxPerCell, floats, visibleChips: health.visibleChips };
    });
    expect(overlap.maxPerCell).toBeLessThanOrEqual(1);
    expect(overlap.floats).toBe(0);
    expect(overlap.visibleChips).toBeGreaterThan(0);
  });
});
