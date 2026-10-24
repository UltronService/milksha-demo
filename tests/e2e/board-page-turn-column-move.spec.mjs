import { test, expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import { assertReadyPulseOnNumber } from './board-column-move-helpers.mjs';
import { applyPayload, prepPayload, readyPayload, sequentialNumbers } from './board-column-move-helpers.mjs';

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

test('new prep on page 2+ jumps to page 1 with motion on', async ({ page }) => {
  await primeBoardForAnimation(page);
  const eleven = sequentialNumbers(8101, 11);
  await applyPayload(page, prepPayload(eleven));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
  await page.waitForTimeout(500);
  await applyPayload(page, prepPayload([...eleven, 8112]));
  await expect(page.locator('.milksha-prep .milksha-pg-indicator')).toHaveText('1/2', {
    timeout: 4000,
  });
  await expect(page.locator('.milksha-prep .milksha-num').first()).toHaveText('8112', {
    timeout: 4000,
  });
});

test('new ready on page 2+ jumps to page 1 and plays ready pulse', async ({ page }) => {
  await primeBoardForAnimation(page);
  const eleven = sequentialNumbers(8201, 11);
  await applyPayload(page, readyPayload(eleven));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
  await page.waitForTimeout(500);
  const newest = '8212';
  await applyPayload(page, readyPayload([...eleven, Number(newest)]));
  await expect(page.locator('.milksha-ready .milksha-pg-indicator')).toHaveText('1/2', {
    timeout: 4000,
  });
  await assertReadyPulseOnNumber(page, newest);
});
