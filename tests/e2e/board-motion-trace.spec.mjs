import { test, expect } from '@playwright/test';
import {
  primeBoardWithMotionTrace,
  assertMotionTraceAndAnalyze,
  assertMotionTraceDisabledOnDefaultBoard,
  prepPayload,
  applyPayload,
  sequentialNumbers,
  GRID_ROWS,
} from './board-motion-trace-helpers.mjs';

test.describe('board motion trace (test-only)', () => {
  test('switch OFF: no trace global on default board URL', async ({ page }) => {
    await assertMotionTraceDisabledOnDefaultBoard(page);
  });

  test('new-order-fade-in: trace spans animation', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    await page.evaluate(() => {
      window.__milkshaMotionTrace.clear();
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '7101' }]);
    });
    await assertMotionTraceAndAnalyze(page, 'new-order-fade-in');
  });

  test('pickup-disappear: trace spans ready fade-out', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '7199' },
        { source_type: 'From_Store_OK', number: '7201' },
      ]);
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__milkshaMotionTrace.clear();
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '7199' }]);
    });
    await assertMotionTraceAndAnalyze(page, 'pickup-disappear');
  });

  test('clear-board: trace on empty payload', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '7301' },
        { source_type: 'From_Store_OK', number: '7302' },
      ]);
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__milkshaMotionTrace.clear();
      window.QMS.runtime.applyPayload([]);
    });
    const { session } = await assertMotionTraceAndAnalyze(page, 'clear-board');
    expect(session.motionType).toBe('clear-board');
  });

  test('column-move: trace on 6th prep number', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    const nums = sequentialNumbers(7401, 5);
    await applyPayload(page, prepPayload(nums));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__milkshaMotionTrace.clear());
    await applyPayload(page, prepPayload([...nums, nums[nums.length - 1] + 1]));
    await assertMotionTraceAndAnalyze(page, 'column-move');
  });

  test('backfill: trace after ready pickup refill', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_OK', number: '7501' },
        { source_type: 'From_Store_OK', number: '7502' },
        { source_type: 'From_Store_OK', number: '7503' },
      ]);
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__milkshaMotionTrace.clear();
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_OK', number: '7502' },
        { source_type: 'From_Store_OK', number: '7503' },
      ]);
    });
    await assertMotionTraceAndAnalyze(page, 'backfill');
  });

  test('page-turn: trace on manual prep page advance', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    const batch = [];
    for (let i = 1; i <= 11; i += 1) {
      batch.push({ source_type: 'From_Store_Preparing', number: String(7600 + i) });
    }
    await page.evaluate((payload) => {
      window.QMS.runtime.applyPayload(payload);
    }, batch);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__milkshaMotionTrace.clear());
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
    await assertMotionTraceAndAnalyze(page, 'page-turn');
  });
});
