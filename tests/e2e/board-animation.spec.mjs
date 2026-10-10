import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  primeBoardForAnimation,
  resetOpacityAnimCounter,
  opacityAnimRunsSinceReset,
  assertChipsOpaqueAndUnique,
  prepNumbers,
  readyNumbers,
} from './board-animation-helpers.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), '../../artifacts/board-animation-self-qa');

test.describe('board call animation specs 1–7', () => {
  test.beforeAll(() => {
    mkdirSync(join(ART, 'screenshots'), { recursive: true });
  });

  test('1 prep: new number in DOM immediately; opacity anim runs', async ({ page }) => {
    await primeBoardForAnimation(page);
    await resetOpacityAnimCounter(page);
    const t0 = Date.now();
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '5101' }]);
    });
    await expect(page.locator('[data-item-id="store:5101"]')).toBeAttached({ timeout: 500 });
    expect(Date.now() - t0).toBeLessThan(3000);
    await page.waitForTimeout(50);
    const runs = await opacityAnimRunsSinceReset(page);
    expect(runs).toBeGreaterThan(0);
    await page.waitForTimeout(350);
    await assertChipsOpaqueAndUnique(page);
    expect((await prepNumbers(page)).map((t) => t.trim())).toEqual(['5101']);
  });

  test('2 prep→ready: leave prep, ready scale+opacity pulse', async ({ page }) => {
    await primeBoardForAnimation(page);
    await resetOpacityAnimCounter(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '5201' }]);
    });
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '5201' },
        { source_type: 'From_Store_OK', number: '5201' },
      ]);
    });
    await expect(page.locator('.milksha-prep [data-item-id="store:5201"]')).toHaveCount(0);
    const chip = page.locator('.milksha-ready [data-item-id="store:5201"]');
    await expect(chip).toBeVisible();
    expect(await opacityAnimRunsSinceReset(page)).toBeGreaterThan(0);
    await expect(chip).not.toHaveClass(/milksha-board-chip--highlight/);
    await page.waitForTimeout(4000);
    await assertChipsOpaqueAndUnique(page);
    const tf = await chip.evaluate((el) => getComputedStyle(el).transform);
    expect(tf === 'none' || tf.includes('matrix(1')).toBe(true);
  });

  test('3 picked up: ready number fades out and others refill', async ({ page }) => {
    await primeBoardForAnimation(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_OK', number: '5301' },
        { source_type: 'From_Store_OK', number: '5302' },
      ]);
    });
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '5302' }]);
    });
    await page.waitForTimeout(400);
    expect((await readyNumbers(page)).map((t) => t.trim())).toEqual(['5302']);
    await assertChipsOpaqueAndUnique(page);
  });

  test('4 page turn: >10 items cross-fade pages', async ({ page }) => {
    await primeBoardForAnimation(page);
    const batch = [];
    for (let i = 1; i <= 11; i += 1) {
      batch.push({ source_type: 'From_Store_Preparing', number: String(5400 + i) });
    }
    await page.evaluate((payload) => {
      window.QMS.runtime.applyPayload(payload);
    }, batch);
    await page.waitForTimeout(350);
    await resetOpacityAnimCounter(page);
    const turnPromise = page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
    await expect(page.locator('.milksha-prep .milksha-zone-numbers[data-page-turn-anim="1"]')).toBeAttached({
      timeout: 3000,
    });
    const turned = await turnPromise;
    expect(turned).toBe(true);
    await page.waitForFunction(
      () => {
        const t = [...document.querySelectorAll('.milksha-prep .milksha-num')]
          .map((el) => el.textContent.trim())
          .filter(Boolean);
        return t.length === 1 && t[0] === '5401';
      },
      { timeout: 3000 },
    );
    expect((await prepNumbers(page)).map((t) => t.trim())).toEqual(['5401']);
    await assertChipsOpaqueAndUnique(page);
  });

  test('5 clear board: all chips fade out', async ({ page }) => {
    await primeBoardForAnimation(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '5501' },
        { source_type: 'From_Store_OK', number: '5502' },
      ]);
    });
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([]);
    });
    await page.waitForTimeout(400);
    expect(await page.locator('.milksha-board-chip').count()).toBe(0);
  });

  test('peak: three new prep and three ready in one apply still animates', async ({ page }) => {
    await primeBoardForAnimation(page);
    await resetOpacityAnimCounter(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '5611' },
        { source_type: 'From_Store_Preparing', number: '5612' },
        { source_type: 'From_Store_Preparing', number: '5613' },
        { source_type: 'From_Store_OK', number: '5621' },
        { source_type: 'From_Store_OK', number: '5622' },
        { source_type: 'From_Store_OK', number: '5623' },
      ]);
    });
    expect(await page.evaluate(() => window.QMS.runtime.getAnimSkipReason())).toBe('animate');
    expect(await opacityAnimRunsSinceReset(page)).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    await assertChipsOpaqueAndUnique(page);
  });

  test('6 full silent resend: no opacity animations', async ({ page }) => {
    await primeBoardForAnimation(page);
    const batch = [
      { source_type: 'From_Store_Preparing', number: '5601' },
      { source_type: 'From_Store_OK', number: '5602' },
    ];
    await page.evaluate((payload) => {
      window.QMS.runtime.applyPayload(payload);
    }, batch);
    await page.waitForTimeout(400);
    await resetOpacityAnimCounter(page);
    await page.evaluate((payload) => {
      window.QMS.runtime.applyPayload(payload, { silent: true });
    }, batch);
    expect(await page.evaluate(() => window.QMS.runtime.getAnimSkipReason())).toBe('silent-reconnect');
    expect(await opacityAnimRunsSinceReset(page)).toBe(0);
    expect((await prepNumbers(page)).map((t) => t.trim())).toEqual(['5601']);
    expect((await readyNumbers(page)).map((t) => t.trim())).toEqual(['5602']);
  });

  test('7 rapid updates: final DOM correct, no dup, opaque', async ({ page }) => {
    await primeBoardForAnimation(page);
    for (let i = 0; i < 5; i += 1) {
      await page.evaluate((n) => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: String(5700 + n) },
          { source_type: 'From_Store_OK', number: String(5800 + n) },
        ]);
      }, i);
    }
    await page.waitForTimeout(500);
    await assertChipsOpaqueAndUnique(page);
    const prep = (await prepNumbers(page)).map((t) => t.trim());
    const ready = (await readyNumbers(page)).map((t) => t.trim());
    expect(prep[0]).toBe('5704');
    expect(ready[0]).toBe('5804');
  });

  test('background tab return: chips not stuck semi-transparent', async ({ page }) => {
    await primeBoardForAnimation(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '5901' }]);
    });
    await page.waitForTimeout(40);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get() {
          return this.__vis || 'visible';
        },
      });
      document.__vis = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      document.__vis = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await assertChipsOpaqueAndUnique(page);
  });

  test('prefers-reduced-motion: skip animations', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await primeBoardForAnimation(page);
    await resetOpacityAnimCounter(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '5951' }]);
    });
    expect(await page.evaluate(() => window.QMS.runtime.getAnimSkipReason())).toBe('prefers-reduced-motion');
    expect(await opacityAnimRunsSinceReset(page)).toBe(0);
    await ctx.close();
  });

  test('no Web Animations API: instant display', async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      try {
        delete Element.prototype.animate;
      } catch {
        Element.prototype.animate = undefined;
      }
    });
    const page = await ctx.newPage();
    await primeBoardForAnimation(page);
    await resetOpacityAnimCounter(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '5961' }]);
    });
    expect(await page.evaluate(() => window.QMS.runtime.getAnimSkipReason())).toBe('no-web-animations-api');
    expect(await opacityAnimRunsSinceReset(page)).toBe(0);
    await expect(page.locator('[data-item-id="store:5961"]')).toBeVisible();
    await ctx.close();
  });
});
