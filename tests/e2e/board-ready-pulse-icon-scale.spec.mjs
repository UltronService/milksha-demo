import { test, expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import { waitForPulseHold } from './board-ready-scale-overlap-helpers.mjs';

async function triggerFpReadyPulse(page) {
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload(
      [{ source_type: 'From_FoodPanda_Preparing', number: '#6405' }],
      { silent: true },
    );
    window.QMS.runtime.applyPayload([{ source_type: 'From_FoodPanda_OK', number: '#6405' }]);
  });
}

test.describe('ready pulse delivery icon scales with number', () => {
  test('hold: icon-box and .milksha-num both scale 1.3 with center origin; rects do not overlap', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await primeBoardForAnimation(page);
    await triggerFpReadyPulse(page);

    const itemId = 'ready::fp:#6405';
    await page.waitForFunction(
      (id) => document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]'),
      itemId,
      { timeout: 15000 },
    );
    await waitForPulseHold(page, itemId, 1.3);

    const m = await page.evaluate((id) => {
      const chip = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
      const num = chip && chip.querySelector('.milksha-num');
      const iconBox = chip && chip.querySelector('.milksha-board-icon-box');
      if (!chip || !num || !iconBox) {
        return { ok: false, reason: 'missing chip, num, or icon-box' };
      }
      const chipTr = getComputedStyle(chip).transform;
      const chipScale =
        chipTr === 'none' ? 1 : Number.parseFloat(chipTr.match(/matrix\(([^)]+)\)/)?.[1]?.split(',')[0] || '1');
      const numTr = getComputedStyle(num).transform;
      const numScale = Number.parseFloat(numTr.match(/matrix\(([^)]+)\)/)?.[1]?.split(',')[0] || '1');
      const iconTr = getComputedStyle(iconBox).transform;
      const iconScale = Number.parseFloat(iconTr.match(/matrix\(([^)]+)\)/)?.[1]?.split(',')[0] || '1');
      const numOriginInline = num.style.transformOrigin;
      const iconOriginInline = iconBox.style.transformOrigin;
      const numRect = num.getBoundingClientRect();
      const iconRect = iconBox.getBoundingClientRect();
      const overlap =
        numRect.left < iconRect.right &&
        numRect.right > iconRect.left &&
        numRect.top < iconRect.bottom &&
        numRect.bottom > iconRect.top;
      return {
        ok: true,
        chipScale: Math.round(chipScale * 1000) / 1000,
        numScale: Math.round(numScale * 1000) / 1000,
        iconScale: Math.round(iconScale * 1000) / 1000,
        numOriginInline,
        iconOriginInline,
        overlap,
      };
    }, itemId);

    expect(m.ok).toBe(true);
    expect(m.chipScale).toBeGreaterThanOrEqual(0.99);
    expect(m.chipScale).toBeLessThanOrEqual(1.01);
    expect(m.numScale).toBeGreaterThanOrEqual(1.26);
    expect(m.numScale).toBeLessThanOrEqual(1.34);
    expect(m.iconScale).toBeGreaterThanOrEqual(1.26);
    expect(m.iconScale).toBeLessThanOrEqual(1.34);
    expect(m.numOriginInline).toMatch(/^\d+(\.\d+)?px \d+(\.\d+)?px$/);
    expect(m.iconOriginInline).toMatch(/^\d+(\.\d+)?px \d+(\.\d+)?px$/);
    expect(m.overlap).toBe(false);
  });
});
