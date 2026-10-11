import { test } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import {
  backfillRemovalCase,
  zoneRows,
  zoneRowsWithout,
  applyPayload,
  assertBackfillChipStaysInCreamEveryFrame,
} from './board-motion-backfill-helpers.mjs';

const PREP_START = 5200;
const READY_START = 5300;
const REMOVE_OFFSET = 3;

test.describe('backfill enter-from-below stays inside .milksha-cream (tol 0)', () => {
  for (const view of [
    { w: 1920, h: 1080, tag: '1080p' },
    { w: 3840, h: 2160, tag: '4k' },
  ]) {
    test(`prep ${view.tag}`, async ({ page }) => {
      await page.setViewportSize({ width: view.w, height: view.h });
      await primeBoardForAnimation(page);
      const start = view.tag === '4k' ? PREP_START + 10 : PREP_START;
      const { removeNum, backfillNum } = backfillRemovalCase(start, REMOVE_OFFSET);
      await applyPayload(page, zoneRows('prep', start, 7));
      await page.waitForTimeout(400);
      await assertBackfillChipStaysInCreamEveryFrame(page, 'prep', 'store:' + backfillNum, async () => {
        await applyPayload(page, zoneRowsWithout('prep', start, 7, removeNum));
      });
    });

    test(`ready ${view.tag}`, async ({ page }) => {
      await page.setViewportSize({ width: view.w, height: view.h });
      await primeBoardForAnimation(page);
      const start = view.tag === '4k' ? READY_START + 10 : READY_START;
      const { removeNum, backfillNum } = backfillRemovalCase(start, REMOVE_OFFSET);
      await applyPayload(page, zoneRows('ready', start, 7));
      await page.waitForTimeout(400);
      await assertBackfillChipStaysInCreamEveryFrame(page, 'ready', 'store:' + backfillNum, async () => {
        await applyPayload(page, zoneRowsWithout('ready', start, 7, removeNum));
      });
    });
  }
});
