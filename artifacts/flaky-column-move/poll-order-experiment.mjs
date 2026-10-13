/** Compare parallel poll (prod) vs poll-after-trigger (diagnostic). */
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

async function runMode(mode) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await primeBoardForAnimation(page);
  const nums = sequentialNumbers(6701, 5);
  const newest = nums[nums.length - 1] + 1;
  await applyPayload(page, readyPayload(nums));
  await page.waitForTimeout(400);

  const combined = [];
  if (mode === 'parallel') {
    const poll = (async () => {
      for (let i = 0; i < 28; i += 1) {
        combined.push(await chipMotionSampleAtSlot(page, 'ready', GRID_ROWS));
        await page.waitForTimeout(16);
      }
    })();
    await applyPayload(page, readyPayload([...nums, newest]));
    await poll;
  } else {
    await applyPayload(page, readyPayload([...nums, newest]));
    for (let i = 0; i < 28; i += 1) {
      combined.push(await chipMotionSampleAtSlot(page, 'ready', GRID_ROWS));
      await page.waitForTimeout(16);
    }
  }

  const enterSamples = combined.filter(Boolean);
  const tops = enterSamples.map((s) => s.top);
  const delta = tops.length ? Math.max(...tops) - Math.min(...tops) : 0;
  const fromAbove =
    enterSamples.some((s) => transformTranslateY(s.transform) < -8) || delta > 12;
  await browser.close();
  return fromAbove;
}

let parPass = 0;
let seqPass = 0;
for (let i = 0; i < 20; i += 1) {
  if (await runMode('parallel')) {
    parPass += 1;
  }
  if (await runMode('sequential')) {
    seqPass += 1;
  }
}
console.log(JSON.stringify({ parallelPass: parPass, sequentialPass: seqPass, runs: 20 }, null, 2));
