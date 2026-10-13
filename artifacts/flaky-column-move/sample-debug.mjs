/**
 * Mirrors pollMotionSamples window for test 5 ready (diagnostic only).
 */
import { chromium } from '@playwright/test';
import { primeBoardForAnimation } from '../../tests/e2e/board-animation-helpers.mjs';
import {
  chipMotionSampleAtSlot,
  transformTranslateY,
  readyPayload,
  applyPayload,
  sequentialNumbers,
} from '../../tests/e2e/board-column-move-helpers.mjs';

const GRID_ROWS = 5;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await primeBoardForAnimation(page);
const nums = sequentialNumbers(6701, 5);
const newest = nums[nums.length - 1] + 1;
await applyPayload(page, readyPayload(nums));
await page.waitForTimeout(400);

const combined = [];
const poll = (async () => {
  for (let i = 0; i < 28; i += 1) {
    combined.push(await chipMotionSampleAtSlot(page, 'ready', GRID_ROWS));
    await page.waitForTimeout(16);
  }
})();
await applyPayload(page, readyPayload([...nums, newest]));
await poll;

const enterSamples = combined.filter(Boolean);
const tops = enterSamples.map((s) => s.top);
const delta = tops.length ? Math.max(...tops) - Math.min(...tops) : 0;
const fromAbove =
  enterSamples.some((s) => transformTranslateY(s.transform) < -8) || delta > 12;

console.log(
  JSON.stringify(
    {
      pass: fromAbove,
      delta,
      count: enterSamples.length,
      minTy: Math.min(...enterSamples.map((s) => transformTranslateY(s.transform))),
    },
    null,
    2,
  ),
);
await browser.close();
