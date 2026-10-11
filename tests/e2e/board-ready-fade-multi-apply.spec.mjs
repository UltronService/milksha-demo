import { test, expect } from '@playwright/test';
import {
  primeBoardForAnimation,
  assertEachCellSingleNumber,
  getBoardIntegritySnapshot,
} from './board-animation-helpers.mjs';

const LIVE_APPLY_BURST = 5;
const LIVE_BURST_WINDOW_MS = 800;
const SEND_GAP_MS = 1000;
const READY_NUMBERS = ['2001', '2002', '2003', '2004', '2005'];

/** @returns {Promise<number>} ms to wait after last burst (AnimConfig + margin, min 10s). */
async function animationSettleMs(page) {
  return page.evaluate(() => {
    const cfg = window.QMS.MilkshaBoardAnim.getAnimConfig();
    const pulseMs = cfg.readyScaleInMs + cfg.readyScaleHoldMs + cfg.readyScaleOutMs;
    const margin = 500;
    return Math.max(10_000, pulseMs + margin);
  });
}

/** @returns {Promise<Array<{ num: string, opacity: number, inline: string }>>} */
async function readyInCellOpacitySample(page) {
  return page.evaluate(() => {
    const chips = [
      ...document.querySelectorAll(
        '.milksha-ready .milksha-num-cell .milksha-board-chip:not(.milksha-board-chip--layer-float)',
      ),
    ];
    return chips.map((el) => ({
      num: el.querySelector('.milksha-num')?.textContent?.trim() || '',
      opacity: parseFloat(getComputedStyle(el).opacity),
      inline: el.style.opacity,
    }));
  });
}

test.describe('ready fade regression (fake local board, live multi-apply pattern)', () => {
  test('forced pulse cancel on oldest ready chip during multi-apply burst stays opaque', async ({ page }) => {
    await primeBoardForAnimation(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '2001' }]);
    });
    await page.evaluate(() => {
      const chip = document.querySelector('.milksha-ready .milksha-num-cell .milksha-board-chip');
      if (!chip) {
        throw new Error('missing first ready chip');
      }
      for (const anim of chip.getAnimations()) {
        anim.cancel();
      }
    });
    const payload = [
      { source_type: 'From_Store_OK', number: '2002' },
      { source_type: 'From_Store_OK', number: '2001' },
    ];
    await page.evaluate((p) => {
      for (let i = 0; i < 5; i += 1) {
        window.QMS.runtime.applyPayload(p);
      }
    }, payload);
    await page.waitForTimeout(100);
    const opacities = await readyInCellOpacitySample(page);
    const bad = opacities.filter((c) => !Number.isFinite(c.opacity) || c.opacity < 0.99);
    expect(
      bad,
      `deterministic cancel + burst must not leave stuck opacity 0; got ${JSON.stringify(opacities)}`,
    ).toEqual([]);
    const integrity = await getBoardIntegritySnapshot(page);
    expect(integrity.violations, JSON.stringify(integrity.violations)).toEqual([]);
  });

  test('five sends 1s apart with 5× applyPayload burst per send → all ready chips opaque', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await primeBoardForAnimation(page);

    for (let send = 0; send < READY_NUMBERS.length; send += 1) {
      const readySlice = READY_NUMBERS.slice(0, send + 1).map((number) => ({
        source_type: 'From_Store_OK',
        number,
      }));
      await page.evaluate(({ payload, burst, windowMs }) => {
        const rt = window.QMS.runtime;
        const gap = burst > 1 ? Math.floor(windowMs / (burst - 1)) : 0;
        let scheduled = 0;
        for (let i = 0; i < burst; i += 1) {
          if (gap > 0 && i > 0) {
            scheduled += gap;
            // Spread applies across the live-style 800ms window (same thread scheduling).
            const start = performance.now();
            while (performance.now() - start < gap) {
              /* spin */
            }
          }
          rt.applyPayload(payload);
        }
        return scheduled;
      }, { payload: readySlice, burst: LIVE_APPLY_BURST, windowMs: LIVE_BURST_WINDOW_MS });
      await expect(page.locator('.milksha-ready .milksha-num')).toHaveCount(send + 1);

      // Shorter than ready pulse (AnimConfig ~3600ms): catches stuck inline opacity before headless finishes WAAPI.
      const settleAfterBurstMs = await animationSettleMs(page);
      const postBurstMs = Math.min(400, Math.floor(settleAfterBurstMs / 10));
      await page.waitForTimeout(postBurstMs);

      const opacitiesAfterSend = await readyInCellOpacitySample(page);
      const badAfterSend = opacitiesAfterSend.filter((c) => !Number.isFinite(c.opacity) || c.opacity < 0.99);
      expect(
        badAfterSend,
        `after send ${send + 1} (${LIVE_APPLY_BURST}× apply in ${LIVE_BURST_WINDOW_MS}ms), every ready in-cell chip must be opaque; got ${JSON.stringify(opacitiesAfterSend)}`,
      ).toEqual([]);

      const integrityAfterSend = await getBoardIntegritySnapshot(page);
      expect(integrityAfterSend.violations, JSON.stringify(integrityAfterSend.violations)).toEqual([]);

      if (send < READY_NUMBERS.length - 1) {
        await page.waitForTimeout(SEND_GAP_MS);
      }
    }

    await assertEachCellSingleNumber(page);
  });
});
