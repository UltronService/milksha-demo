import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import {
  OVERFLOW_VIEWPORTS,
  STORE_FOUR,
  UBER_SIX,
  pr95OverflowArtifactsDir,
  buildUberSixCharOverflowPayload,
  measureReadyLeftColumnChips,
  assertChipOverflowRules,
} from './board-uber-six-char-column-overflow-helpers.mjs';

async function openBoardForOverflow(page) {
  const base = `http://127.0.0.1:${process.env.MILKSHA_E2E_PORT || '8877'}`;
  await page.goto(`${base}/?mode=local&motion=off`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), undefined, {
    timeout: 25000,
  });
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
  });
}

async function seedFourAndSixReady(page) {
  await page.evaluate((rows) => {
    window.QMS.runtime.applyPayload(rows);
  }, buildUberSixCharOverflowPayload());
  await expect(page.locator('.milksha-ready .milksha-num', { hasText: STORE_FOUR })).toHaveCount(1);
  await expect(page.locator('.milksha-ready .milksha-num', { hasText: UBER_SIX })).toHaveCount(1);
}

async function sampleScaleInvocationsDuringIdle(page, frames) {
  return page.evaluate(async (frameCount) => {
    const api = window.QMS?.Board?.ChipOverflowFit;
    if (!api || typeof api.getScaleInvocationCount !== 'function') {
      return { ok: false, reason: 'missing-fit-api' };
    }
    if (typeof api.resetScaleInvocationCount === 'function') {
      api.resetScaleInvocationCount();
    }
    const before = api.getScaleInvocationCount();
    await new Promise((resolve) => {
      let n = 0;
      function tick() {
        n += 1;
        if (n >= frameCount) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    const after = api.getScaleInvocationCount();
    return { ok: true, before, after, delta: after - before };
  }, frames);
}

test.describe('PR #95: uber 6-char + icon column overflow', () => {
  for (const viewport of OVERFLOW_VIEWPORTS) {
    test(`${viewport.tag}: bounding boxes + screenshot (4-char beside 6-char)`, async ({ page }) => {
      const artDir = pr95OverflowArtifactsDir();
      await openBoardForOverflow(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(200);
      await seedFourAndSixReady(page);
      await page.waitForTimeout(150);

      const shotPath = join(artDir, 'screenshots', `board-uber-six-char-${viewport.tag}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      const m = await measureReadyLeftColumnChips(page);
      const ruleErrors = assertChipOverflowRules(m, viewport.tag);
      expect(ruleErrors, ruleErrors.join('; ')).toEqual([]);

      expect(m.four.ok).toBe(true);
      expect(m.six.ok).toBe(true);
      expect(m.four.cellIndex).toBeGreaterThanOrEqual(0);
      expect(m.six.cellIndex).toBeGreaterThanOrEqual(0);
      expect(Math.abs(m.four.cellIndex - m.six.cellIndex)).toBe(1);
    });
  }

  test('only six-char chip shrinks; four-char stays base font', async ({ page }) => {
    await openBoardForOverflow(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await seedFourAndSixReady(page);
    const m = await measureReadyLeftColumnChips(page);
    expect(m.ok).toBe(true);
    expect(m.four.fontPx).toBe(m.baseFontPx);
    expect(m.six.fontPx).toBeLessThan(m.four.fontPx);
    expect(m.six.chipScale).toBeLessThan(1);
    expect(m.four.chipScale).toBeLessThanOrEqual(1.001);
  });

  test('min-scale failure logs once per item across redraws', async ({ page }) => {
    await openBoardForOverflow(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => {
      const art = window.QMS.Board.LandscapeArtLayout;
      const orig = art.columnInnerRectsBoard.bind(art);
      art.columnInnerRectsBoard = function (zone) {
        const rows = orig(zone);
        return [
          { left: rows[0].left, right: rows[0].left + 40 },
          rows[1],
        ];
      };
      window.QMS.Board.ChipOverflowFit.resetFailureLog();
    });
    const payload = [{ source_type: 'From_UberEat_OK', number: 'AB12C' }];
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), payload);
    await page.waitForTimeout(100);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), payload);
    await page.waitForTimeout(100);
    const logged = await page.evaluate(() => window.QMS.Board.ChipOverflowFit.getFailureLoggedIds());
    expect(logged.length).toBe(1);
    expect(logged[0]).toMatch(/^uber:AB12C$/);
  });

  test('scale fit API: no recompute every idle frame after payload', async ({ page }) => {
    await openBoardForOverflow(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await seedFourAndSixReady(page);
    await page.waitForTimeout(200);

    const idle = await sampleScaleInvocationsDuringIdle(page, 45);
    expect(idle.ok, idle.reason || 'ChipOverflowFit probe required').toBe(true);
    expect(idle.delta, 'overflow scale must not run every animation frame').toBe(0);
  });
});
