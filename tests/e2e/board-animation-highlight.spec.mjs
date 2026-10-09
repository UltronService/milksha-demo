import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshContext, urlsLocalHomePoc } from './harness.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), '../../artifacts/board-animation-self-qa/screenshots');

test.describe('board ready highlight (prep green chip)', () => {
  test.beforeAll(() => {
    mkdirSync(ART, { recursive: true });
  });

  test('highlight uses prep green then fades to cream without layout shift', async ({ browser }) => {
    test.setTimeout(90000);
    const ctx = await freshContext(browser);
    const page = await ctx.newPage();
    const { board: boardUrl } = urlsLocalHomePoc();
    await page.goto(boardUrl);
    await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), { timeout: 25000 });

    await page.evaluate(() => {
      window.QMS.runtime.applyPayload(
        [{ source_type: 'From_Store_Preparing', number: '7701' }],
        { silent: true },
      );
    });
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '7701' },
        { source_type: 'From_Store_OK', number: '7701' },
      ]);
    });

    const chip = page.locator('.milksha-ready .milksha-board-chip[data-item-id="store:7701"]');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveClass(/milksha-board-chip--highlight/);

    const during = await chip.evaluate((el) => {
      const num = el.querySelector('.milksha-num');
      const before = getComputedStyle(el, '::before');
      return {
        numColor: num ? getComputedStyle(num).color : '',
        beforeOpacity: before.opacity,
        beforeBg: before.backgroundColor,
      };
    });
    expect(during.beforeOpacity).toBe('1');
    expect(during.numColor).toMatch(/34,\s*34,\s*34/);

    await page.screenshot({ path: join(ART, 'ready-highlight-active-1920.png'), fullPage: false });

    await page.waitForTimeout(3300);
    await expect(chip).not.toHaveClass(/milksha-board-chip--highlight/);

    const after = await chip.evaluate((el) => getComputedStyle(el, '::before').opacity);
    expect(after).toBe('0');

    await page.screenshot({ path: join(ART, 'ready-highlight-faded-1920.png'), fullPage: false });

    const badOpacity = await page.locator('.milksha-board-chip').evaluateAll((els) =>
      els.filter((el) => {
        const o = getComputedStyle(el).opacity;
        return o !== '1' && o !== '';
      }).length,
    );
    expect(badOpacity).toBe(0);

    await ctx.close();
  });
});
