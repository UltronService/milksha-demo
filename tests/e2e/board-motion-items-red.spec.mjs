/** Red tests brought from PR #47 (items 2 & 3 only). */
import { test, expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import {
  chipPositionDrift,
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

  // Item 3 (reverse backfill overlap) deferred with backfill animation — follow-up PR.
});
