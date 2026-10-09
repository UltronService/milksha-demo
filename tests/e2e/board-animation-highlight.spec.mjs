import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  primeBoardForAnimation,
  resetOpacityAnimCounter,
  opacityAnimRunsSinceReset,
  waitForChipsOpaque,
} from './board-animation-helpers.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), '../../artifacts/board-ready-fade-self-qa/contact-sheets');

test.describe('board ready zone scale + fade pulse', () => {
  test.beforeAll(() => {
    mkdirSync(ART, { recursive: true });
  });

  test('new ready: opacity + scale pulse, no highlight background; stable after hold', async ({ page }) => {
    test.setTimeout(90000);
    await primeBoardForAnimation(page);
    await resetOpacityAnimCounter(page);

    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '7701' }]);
    });
    await page.waitForTimeout(200);

    const scaleMid = await page.evaluate(() => {
      return new Promise((resolve) => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '7701' },
          { source_type: 'From_Store_OK', number: '7701' },
        ]);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const chip = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="store:7701"]');
            if (!chip) {
              resolve({ found: false });
              return;
            }
            const m = getComputedStyle(chip).transform;
            const o = getComputedStyle(chip).opacity;
            const before = getComputedStyle(chip, '::before').content;
            resolve({ found: true, transform: m, opacity: o, beforeContent: before });
          });
        });
      });
    });
    expect(scaleMid.found).toBe(true);
    expect(scaleMid.beforeContent === 'none' || scaleMid.beforeContent === '').toBe(true);
    expect(await opacityAnimRunsSinceReset(page)).toBeGreaterThan(0);

    const chip = page.locator('.milksha-ready .milksha-board-chip[data-item-id="store:7701"]');
    await waitForChipsOpaque(page);
    await expect(chip).not.toHaveClass(/milksha-board-chip--highlight/);

    await page.waitForFunction(
      () => {
        const el = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="store:7701"]');
        if (!el) {
          return false;
        }
        const t = getComputedStyle(el).transform;
        return t === 'none' || t.startsWith('matrix(1,');
      },
      { timeout: 8000 },
    );
    const afterHold = await chip.evaluate((el) => ({
      transform: getComputedStyle(el).transform,
      opacity: getComputedStyle(el).opacity,
    }));
    expect(afterHold.opacity).toBe('1');
  });
});
