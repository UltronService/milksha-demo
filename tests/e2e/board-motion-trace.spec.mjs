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

  test('pickup-disappear and clear-board record more than 3 frames', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '7299' },
        { source_type: 'From_Store_OK', number: '7300' },
      ]);
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__milkshaMotionTrace.clear();
      window.QMS.runtime.applyPayload([]);
    });
    const minFrames = await page.evaluate(() => {
      const ms = window.QMS.MilkshaBoardAnimConfig.getConfig().opacityInMs;
      return Math.ceil(ms / 50) + 1;
    });
    await page.waitForTimeout(400);
    const counts = await page.evaluate(() => {
      return window.__milkshaMotionTrace
        .get()
        .filter((s) => s.motionType === 'clear-board')
        .map((s) => s.frames.length);
    });
    expect(counts.some((n) => n >= minFrames)).toBe(true);
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

test.describe('board motion trace ready zone (請取餐)', () => {
  test('ready new-order-fade-in', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    await page.evaluate(() => {
      window.__milkshaMotionTrace.clear();
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '7701' }]);
    });
    await assertMotionTraceAndAnalyze(page, 'new-order-fade-in');
  });

  test('ready pickup-disappear', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '7799' },
        { source_type: 'From_Store_OK', number: '7801' },
      ]);
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__milkshaMotionTrace.clear();
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '7799' }]);
    });
    await assertMotionTraceAndAnalyze(page, 'pickup-disappear');
  });

  test('ready backfill', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_OK', number: '7801' },
        { source_type: 'From_Store_OK', number: '7802' },
        { source_type: 'From_Store_OK', number: '7803' },
      ]);
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__milkshaMotionTrace.clear();
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_OK', number: '7802' },
        { source_type: 'From_Store_OK', number: '7803' },
      ]);
    });
    await assertMotionTraceAndAnalyze(page, 'backfill');
  });

  test('ready column-move', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    const nums = sequentialNumbers(7901, 5);
    await applyPayload(page, nums.map((n) => ({ source_type: 'From_Store_OK', number: String(n) })));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__milkshaMotionTrace.clear());
    await applyPayload(page, [...nums, nums[nums.length - 1] + 1].map((n) => ({ source_type: 'From_Store_OK', number: String(n) })));
    await assertMotionTraceAndAnalyze(page, 'column-move');
  });

  test('ready page-turn', async ({ page }) => {
    await primeBoardWithMotionTrace(page);
    const batch = [];
    for (let i = 1; i <= 11; i += 1) {
      batch.push({ source_type: 'From_Store_OK', number: String(7900 + i) });
    }
    await page.evaluate((payload) => window.QMS.runtime.applyPayload(payload), batch);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__milkshaMotionTrace.clear());
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
    await assertMotionTraceAndAnalyze(page, 'page-turn');
  });
});
