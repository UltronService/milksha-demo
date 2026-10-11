import { test, expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import { measurePageIndicatorInCream, prepRows, readyRows } from './board-page-indicator-helpers.mjs';

const VIEW = { width: 1920, height: 1080 };

test.describe('board page indicator placement', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEW);
    await primeBoardForAnimation(page);
  });

  test('incremental update: prep indicator inside cream bottom-right (1/2)', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(8100, 10));
    await page.waitForTimeout(400);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(8100, 11));
    await page.waitForTimeout(600);
    const m = await measurePageIndicatorInCream(page, 'prep');
    expect(m.ok, JSON.stringify(m)).toBe(true);
    expect(m.text).toBe('1/2');
    expect(m.inNumbersLayer).toBe(true);
    expect(m.insideCream, JSON.stringify(m)).toBe(true);
    expect(m.nearBottomRight, JSON.stringify(m)).toBe(true);
    expect(m.fontSize).toBe('28px');
    expect(m.color).toBe('rgba(34, 34, 34, 0.55)');
  });

  test('each zone shows its own page count (ready 2/3 on page index 1)', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
      ...prepRows(8100, 10),
      ...readyRows(7200, 21),
    ]);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
    await page.waitForTimeout(700);
    await expect(page.locator('.milksha-zone.milksha-prep .milksha-pg-indicator')).toHaveCount(0);
    const readyM = await measurePageIndicatorInCream(page, 'ready');
    expect(readyM.ok).toBe(true);
    expect(readyM.text).toBe('2/3');
    expect(readyM.insideCream).toBe(true);
    expect(readyM.nearBottomRight).toBe(true);
  });

  test('single page per zone: no indicators', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
      ...prepRows(8100, 10),
      ...readyRows(7200, 10),
    ]);
    await page.waitForTimeout(400);
    await expect(page.locator('.milksha-pg-indicator')).toHaveCount(0);
  });
});
