import { test, expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import { applyPayload, prepPayload, sequentialNumbers } from './board-column-move-helpers.mjs';

test('payload during page-turn fade still shows numbers on target page', async ({ page }) => {
  await primeBoardForAnimation(page);
  const forty = sequentialNumbers(8301, 40);
  await applyPayload(page, prepPayload(forty));
  await page.waitForTimeout(400);
  const turnPromise = page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
  await page.waitForTimeout(120);
  await applyPayload(page, prepPayload([...forty, 8341]));
  await turnPromise;
  await page.waitForTimeout(600);
  const visible = await page.evaluate(() => {
    const layer = document.querySelector('.milksha-prep .milksha-zone-numbers');
    if (!layer) {
      return { count: 0, layerOpacity: 0 };
    }
    const nums = [...layer.querySelectorAll('.milksha-num')]
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    return { count: nums.length, layerOpacity: Number.parseFloat(getComputedStyle(layer).opacity) };
  });
  expect(visible.layerOpacity).toBeGreaterThan(0.9);
  expect(visible.count).toBeGreaterThan(0);
});
