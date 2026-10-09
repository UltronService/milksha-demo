import { test } from '@playwright/test';
import {
  assertNoOverlapAtHold,
  numberForCellIndex,
  openBoardForOverlap,
} from './board-ready-scale-overlap-helpers.mjs';

const VIEWPORTS = [
  { width: 1920, height: 1080, tag: '1920x1080' },
  { width: 3840, height: 2160, tag: '3840x2160' },
];

for (const vp of VIEWPORTS) {
  test.describe(`ready 1.3x pulse no overlap @ ${vp.tag}`, () => {
    for (let cellIndex = 0; cellIndex < 10; cellIndex += 1) {
      test(`cell ${cellIndex} (${numberForCellIndex(cellIndex)})`, async ({ browser }) => {
        test.setTimeout(90000);
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await ctx.newPage();
        await openBoardForOverlap(page);
        await assertNoOverlapAtHold(page, cellIndex, vp.tag);
        await ctx.close();
      });
    }
  });
}
