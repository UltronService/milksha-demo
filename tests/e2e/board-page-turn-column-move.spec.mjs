import { test, expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import { applyPayload, prepPayload, sequentialNumbers } from './board-column-move-helpers.mjs';

test('page turn during two-phase column move does not leave prep layer blank', async ({ page }) => {
  await primeBoardForAnimation(page);
  const twenty = sequentialNumbers(8101, 20);
  await applyPayload(page, prepPayload(twenty));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.QMS.MilkshaBoardAnimConfig.setRuntimeOverrides({
      columnMoveTwoPhase: true,
      columnMovePhaseGapMs: 1200,
      columnMoveMs: 300,
      columnMoveEnterMs: 300,
    });
  });
  await applyPayload(page, prepPayload([...twenty, 8121]));
  await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
  await page.waitForTimeout(120);
  const early = await page.evaluate(() => {
    const layer = document.querySelector('.milksha-prep .milksha-zone-numbers');
    if (!layer) {
      return { layerOpacity: 0, visibleChips: 0 };
    }
    const layerOpacity = Number.parseFloat(getComputedStyle(layer).opacity);
    const visibleChips = [...layer.querySelectorAll(
      '.milksha-num-cell .milksha-board-chip:not(.milksha-board-chip--layer-float)',
    )].filter((chip) => Number.parseFloat(getComputedStyle(chip).opacity) > 0.2).length;
    return { layerOpacity, visibleChips };
  });
  expect(early.layerOpacity).toBeGreaterThan(0.15);
  await page.waitForTimeout(1600);
  const count = await page.evaluate(() =>
    [...document.querySelectorAll('.milksha-prep .milksha-num')]
      .map((el) => el.textContent.trim())
      .filter(Boolean).length,
  );
  expect(count).toBeGreaterThan(0);
});
