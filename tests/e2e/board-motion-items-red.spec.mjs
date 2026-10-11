/** Red tests brought from PR #47 (items 2 & 3 only). */
import { test, expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import {
  chipPositionDrift,
  findOverlappingChipPairs,
  prepRows,
  readyRows,
  sampleChipMotionDuring,
} from './board-motion-7-helpers.mjs';

const VIEW = { width: 1920, height: 1080 };

test.describe('board motion items 2–3 (red → green)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEW);
    await primeBoardForAnimation(page);
  });

  test('item 2: leaving ready number fades in place (no drift while fading)', async ({ page }) => {
    const base = readyRows(2100, 8);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), base);
    await page.waitForTimeout(500);
    const sampling = sampleChipMotionDuring(page, 380, 40);
    await page.evaluate(
      (rows) => window.QMS.runtime.applyPayload(rows),
      base.filter((r) => r.number !== '2102'),
    );
    const samples = await sampling;
    const { driftPx, points } = chipPositionDrift(samples, '2102');
    const fading = points.filter((p) => Number.parseFloat(p.opacity) < 0.95);
    expect(fading.length, 'removed chip should be sampled while fading').toBeGreaterThan(0);
    expect(driftPx, `leaving chip moved ${driftPx}px while fading: ${JSON.stringify(points)}`).toBeLessThan(3);
  });

  test('item 3: ready backfill must not overlap other numbers (diagonal FLIP)', async ({ page }) => {
    const base = readyRows(2100, 7);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), base);
    await page.waitForTimeout(500);
    const poll = (async () => {
      const hits = [];
      for (let i = 0; i < 12; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const pairs = await findOverlappingChipPairs(page);
        if (pairs.length) {
          hits.push(...pairs);
        }
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(35);
      }
      return hits;
    })();
    await page.evaluate(
      (rows) => window.QMS.runtime.applyPayload(rows),
      base.filter((r) => r.number !== '2103'),
    );
    const overlaps = await poll;
    expect(overlaps, JSON.stringify(overlaps)).toEqual([]);
  });
});
