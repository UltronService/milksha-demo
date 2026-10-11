import { test, expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import {
  assertCreamInsets,
  measurePageIndicatorPlayout,
  prepRows,
  readyRows,
} from './board-page-indicator-helpers.mjs';
import { waitForPulseHold } from './board-ready-scale-overlap-helpers.mjs';

async function triggerReadyPulseAtCell9WithTwoPages(page) {
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
    const prep = Array.from({ length: 11 }, (_, i) => ({
      source_type: 'From_Store_Preparing',
      number: String(8100 + i),
    }));
    const warm = [];
    for (let i = 0; i < 10; i += 1) {
      const n = String(7200 + i);
      warm.push(
        n === '7209'
          ? { source_type: 'From_Store_Preparing', number: n }
          : { source_type: 'From_Store_OK', number: n },
      );
    }
    window.QMS.runtime.applyPayload([...prep, ...warm], { silent: true });
    const ready = Array.from({ length: 16 }, (_, i) => ({
      source_type: 'From_Store_OK',
      number: String(7200 + i),
    }));
    window.QMS.runtime.applyPayload([...prep, ...ready]);
  });
}

const VIEW_1080 = { width: 1920, height: 1080 };
const VIEW_4K = { width: 3840, height: 2160 };

async function expectZoneIndicatorInsets(page, zoneKey) {
  const m = await measurePageIndicatorPlayout(page, zoneKey);
  expect(m.ok, JSON.stringify(m)).toBe(true);
  expect(assertCreamInsets(m, 3), JSON.stringify(m)).toEqual([]);
  expect(m.minChipGap, JSON.stringify(m)).toBeGreaterThanOrEqual(12);
  return m;
}

test.describe('board page indicator placement @ 1080p', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEW_1080);
    await primeBoardForAnimation(page);
  });

  test('incremental update: prep 1/2 on visible cream bottom-right', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(8100, 10));
    await page.waitForTimeout(400);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(8100, 11));
    await page.waitForTimeout(600);
    const m = await expectZoneIndicatorInsets(page, 'prep');
    expect(m.text).toBe('1/2');
    expect(m.inNumbersLayer).toBe(true);
    expect(m.fontSize).toBe('28px');
    expect(m.color).toBe('rgba(34, 34, 34, 0.55)');
  });

  test('ready 2/3 on page index 1; prep single-page has no indicator', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
      ...prepRows(8100, 10),
      ...readyRows(7200, 21),
    ]);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
    await page.waitForTimeout(700);
    await expect(page.locator('.milksha-zone.milksha-prep .milksha-pg-indicator')).toHaveCount(0);
    const readyM = await expectZoneIndicatorInsets(page, 'ready');
    expect(readyM.text).toBe('2/3');
  });

  test('single page per zone: no indicators', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
      ...prepRows(8100, 10),
      ...readyRows(7200, 10),
    ]);
    await page.waitForTimeout(400);
    await expect(page.locator('.milksha-pg-indicator')).toHaveCount(0);
  });

  test('ready bottom-right pulse 1.3x: indicator still >=12px from chips', async ({ page }) => {
    await triggerReadyPulseAtCell9WithTwoPages(page);
    await waitForPulseHold(page, 'store:7209', 1.3);
    const m = await expectZoneIndicatorInsets(page, 'ready');
    expect(m.text).toBe('1/2');
  });
});

test.describe('board page indicator placement @ 4K', () => {
  test('prep 1/2 + ready 2/3 cream insets and chip gap', async ({ page }) => {
    await page.setViewportSize(VIEW_4K);
    await primeBoardForAnimation(page);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
      ...prepRows(8100, 11),
      ...readyRows(7200, 21),
    ]);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
    await page.waitForTimeout(800);
    const prepM = await expectZoneIndicatorInsets(page, 'prep');
    expect(prepM.text).toBe('1/2');
    const readyM = await expectZoneIndicatorInsets(page, 'ready');
    expect(readyM.text).toBe('2/3');
  });
});
