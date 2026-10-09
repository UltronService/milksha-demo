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

test.describe('board ready zone: opacity fade only (no highlight)', () => {
  test.beforeAll(() => {
    mkdirSync(ART, { recursive: true });
  });

  async function assertNoHighlightBackground(chip) {
    const styles = await chip.evaluate((el) => {
      const before = getComputedStyle(el, '::before');
      const chipStyle = getComputedStyle(el);
      const num = el.querySelector('.milksha-num');
      return {
        beforeContent: before.content,
        beforeOpacity: before.opacity,
        beforeBg: before.backgroundColor,
        chipBg: chipStyle.backgroundColor,
        numColor: num ? getComputedStyle(num).color : '',
        hasHighlightClass: el.classList.contains('milksha-board-chip--highlight'),
        hasUnhighlightClass: el.classList.contains('milksha-board-chip--unhighlighting'),
      };
    });
    expect(styles.hasHighlightClass).toBe(false);
    expect(styles.hasUnhighlightClass).toBe(false);
    expect(styles.beforeContent === 'none' || styles.beforeContent === '').toBe(true);
    const bg = styles.beforeBg || '';
    expect(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' || bg === '').toBe(true);
    return styles;
  }

  test('new ready number fades in without background change; stable after 3s', async ({ page }) => {
    test.setTimeout(60000);
    await primeBoardForAnimation(page);
    await resetOpacityAnimCounter(page);

    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '7701' }]);
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '7701' },
        { source_type: 'From_Store_OK', number: '7701' },
      ]);
    });

    const chip = page.locator('.milksha-ready .milksha-board-chip[data-item-id="store:7701"]');
    await expect(chip).toBeAttached({ timeout: 2000 });

    const midOpacity = await chip.evaluate((el) => getComputedStyle(el).opacity);
    const runs = await opacityAnimRunsSinceReset(page);
    expect(runs).toBeGreaterThan(0);
    expect(midOpacity === '1' || Number(midOpacity) < 1).toBe(true);

    await assertNoHighlightBackground(chip);

    await waitForChipsOpaque(page);
    const afterFade = await assertNoHighlightBackground(chip);

    const baseline = page.locator('.milksha-ready .milksha-board-chip').first();
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_OK', number: '7701' },
        { source_type: 'From_Store_OK', number: '7702' },
      ]);
    });
    await waitForChipsOpaque(page);
    const refChip = page.locator('.milksha-ready .milksha-board-chip[data-item-id="store:7702"]');
    await expect(refChip).toBeVisible();

    const refStyles = await refChip.evaluate((el) => ({
      chipBg: getComputedStyle(el).backgroundColor,
      numColor: getComputedStyle(el.querySelector('.milksha-num')).color,
    }));

    await page.waitForTimeout(3100);
    const late = await chip.evaluate((el) => ({
      chipBg: getComputedStyle(el).backgroundColor,
      numColor: getComputedStyle(el.querySelector('.milksha-num')).color,
      opacity: getComputedStyle(el).opacity,
    }));
    expect(late.opacity).toBe('1');
    expect(late.chipBg).toBe(refStyles.chipBg);
    expect(late.numColor).toBe(refStyles.numColor);
    expect(late.chipBg).toBe(afterFade.chipBg);
  });
});
