import { test, expect } from '@playwright/test';
import {
  primeBoardForAnimation,
  assertEachCellSingleNumber,
  sampleIntegrityDuringUpdate,
  findCellIntegrityViolations,
} from './board-animation-helpers.mjs';

test.describe('board cell integrity (one number per grid cell)', () => {
  test('prep slot swap during fade-out never glues digits', async ({ page }) => {
    await primeBoardForAnimation(page);
    await sampleIntegrityDuringUpdate(page, async () => {
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '2025' },
          { source_type: 'From_Store_Preparing', number: '2022' },
        ]);
      });
      await page.waitForTimeout(30);
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '2039' },
          { source_type: 'From_Store_Preparing', number: '2038' },
        ]);
      });
    });
  });

  test('prep→ready while new prep arrives: sampled cells stay valid', async ({ page }) => {
    await primeBoardForAnimation(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '3010' },
        { source_type: 'From_Store_Preparing', number: '3011' },
        { source_type: 'From_Store_OK', number: '3001' },
      ]);
    });
    await page.waitForTimeout(200);
    await sampleIntegrityDuringUpdate(page, async () => {
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '3012' },
          { source_type: 'From_Store_OK', number: '3010' },
          { source_type: 'From_Store_OK', number: '3001' },
          { source_type: 'From_Store_OK', number: '3011' },
        ]);
      });
    });
  });

  test('ready pulse window: no cell holds two chips', async ({ page }) => {
    await primeBoardForAnimation(page);
    await sampleIntegrityDuringUpdate(page, async () => {
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '2024' }]);
      });
    }, { samples: 40, intervalMs: 100 });
  });

  test('page turn while numbers change: cells stay single-number', async ({ page }) => {
    await primeBoardForAnimation(page);
    const batch = [];
    for (let i = 1; i <= 11; i += 1) {
      batch.push({ source_type: 'From_Store_Preparing', number: String(4000 + i) });
    }
    await page.evaluate((payload) => {
      window.QMS.runtime.applyPayload(payload);
    }, batch);
    await page.waitForTimeout(200);
    await sampleIntegrityDuringUpdate(page, async () => {
      await page.evaluate(async () => {
        window.QMS.runtime.advanceZonePageForTest('prep');
      });
      await page.waitForTimeout(80);
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '4012' },
          { source_type: 'From_Store_Preparing', number: '4011' },
        ]);
      });
    });
  });

  test('rapid burst prep replacements (simulation-like)', async ({ page }) => {
    await primeBoardForAnimation(page);
    let n = 5000;
    for (let round = 0; round < 8; round += 1) {
      const a = String(n);
      const b = String(n + 1);
      n += 2;
      await sampleIntegrityDuringUpdate(
        page,
        async () => {
          await page.evaluate(
            ([noA, noB]) => {
              window.QMS.runtime.applyPayload([
                { source_type: 'From_Store_Preparing', number: noA },
                { source_type: 'From_Store_Preparing', number: noB },
              ]);
            },
            [a, b],
          );
          await page.waitForTimeout(15);
          await page.evaluate(
            ([noA, noB]) => {
              window.QMS.runtime.applyPayload([
                { source_type: 'From_Store_Preparing', number: noB },
                { source_type: 'From_Store_Preparing', number: noA },
              ]);
            },
            [String(n), String(n + 1)],
          );
          n += 2;
        },
        { samples: 16, intervalMs: 20 },
      );
    }
    await assertEachCellSingleNumber(page);
    const bad = await findCellIntegrityViolations(page);
    expect(bad).toEqual([]);
  });
});
