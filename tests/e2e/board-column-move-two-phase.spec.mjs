import { test, expect } from '@playwright/test';
import {
  primeBoardForAnimation,
  assertChipsOpaqueAndUnique,
} from './board-animation-helpers.mjs';
import {
  prepPayload,
  sequentialNumbers,
  chipMotionSampleForNumber,
} from './board-column-move-helpers.mjs';

test('two-phase: new number stays hidden until after move phase', async ({ page }) => {
  await primeBoardForAnimation(page);
  await page.evaluate(() => {
    window.QMS.MilkshaBoardAnimConfig.setRuntimeOverrides({
      columnMoveTwoPhase: true,
      columnMovePhaseGapMs: 120,
      columnMoveMs: 400,
      columnMoveEnterMs: 400,
    });
  });
  const nums = sequentialNumbers(8801, 5);
  const newest = String(nums[nums.length - 1] + 1);
  await page.evaluate((payload) => {
    window.QMS.runtime.applyPayload(payload);
  }, prepPayload(nums));
  await page.waitForTimeout(500);

  await page.evaluate((payload) => {
    window.QMS.runtime.applyPayload(payload);
  }, prepPayload([...nums, Number(newest)]));

  await page.waitForTimeout(80);
  const early = await chipMotionSampleForNumber(page, 'prep', newest);
  expect(early, 'newest chip should exist in DOM').toBeTruthy();
  const earlyOpacity = Number.parseFloat(early.opacity);
  expect(earlyOpacity).toBeLessThan(0.45);

  await page.waitForTimeout(700);
  const late = await chipMotionSampleForNumber(page, 'prep', newest);
  expect(Number.parseFloat(late.opacity)).toBeGreaterThan(0.9);
  await assertChipsOpaqueAndUnique(page);
});

test('two-phase off: newest visible within first 80ms', async ({ page }) => {
  await primeBoardForAnimation(page);
  await page.evaluate(() => {
    window.QMS.MilkshaBoardAnimConfig.setRuntimeOverrides({
      columnMoveTwoPhase: false,
      columnMovePhaseGapMs: 0,
      columnMoveMs: 300,
      columnMoveEnterMs: 300,
    });
  });
  const nums = sequentialNumbers(8901, 5);
  const newest = String(nums[nums.length - 1] + 1);
  await page.evaluate((payload) => window.QMS.runtime.applyPayload(payload), prepPayload(nums));
  await page.waitForTimeout(400);
  await page.evaluate((payload) => window.QMS.runtime.applyPayload(payload), prepPayload([...nums, Number(newest)]));
  await page.waitForTimeout(50);
  const early = await chipMotionSampleForNumber(page, 'prep', newest);
  expect(early).toBeTruthy();
  expect(Number.parseFloat(early.opacity)).toBeGreaterThan(0.05);
});
