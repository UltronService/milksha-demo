import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import { prepRows, readyRows } from './board-page-indicator-helpers.mjs';

const ART_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../artifacts/page-indicator');

const VIEWPORTS = [
  { width: 1920, height: 1080, tag: '1080p' },
  { width: 3840, height: 2160, tag: '4k' },
];

test.describe('board page indicator screenshots', () => {
  test.beforeAll(() => {
    mkdirSync(ART_DIR, { recursive: true });
  });

  for (const vp of VIEWPORTS) {
    test(`prep 1/2 + ready 2/3 @ ${vp.tag}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await primeBoardForAnimation(page);
      await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
        ...prepRows(8100, 11),
        ...readyRows(7200, 21),
      ]);
      // prep 2 pages (1/2), ready 3 pages — advance ready only to 2/3
      await page.waitForTimeout(500);
      await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
      await page.waitForTimeout(800);
      await expect(page.locator('.milksha-zone.milksha-prep .milksha-pg-indicator')).toHaveText('1/2');
      await expect(page.locator('.milksha-zone.milksha-ready .milksha-pg-indicator')).toHaveText('2/3');
      await page.locator('#milksha-board-canvas').screenshot({
        path: join(ART_DIR, `board-indicators-${vp.tag}.png`),
      });
    });

    test(`single page hidden @ ${vp.tag}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await primeBoardForAnimation(page);
      await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
        ...prepRows(8100, 10),
        ...readyRows(7200, 10),
      ]);
      await page.waitForTimeout(400);
      await expect(page.locator('.milksha-pg-indicator')).toHaveCount(0);
      await page.locator('#milksha-board-canvas').screenshot({
        path: join(ART_DIR, `board-indicators-single-page-${vp.tag}.png`),
      });
    });
  }
});
