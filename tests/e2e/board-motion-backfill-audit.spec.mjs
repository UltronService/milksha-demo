import { test } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import {
  backfillRemovalCase,
  zoneRows,
  zoneRowsWithout,
  applyPayload,
  assertBackfillQaAuditWindow,
  assertBackfillChipStaysInCreamEveryFrame,
} from './board-motion-backfill-helpers.mjs';

const PREP_START = 5200;
const READY_START = 5300;
const REMOVE_OFFSET = 3;
const WINDOW_MS = 1800;

test.describe('backfill QA window — cream + title-guard (tol 0)', () => {
  test('prep 1080p reverse backfill', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await primeBoardForAnimation(page);
    const { removeNum } = backfillRemovalCase(PREP_START, REMOVE_OFFSET);
    await applyPayload(page, zoneRows('prep', PREP_START, 7));
    await page.waitForTimeout(400);
    await assertBackfillQaAuditWindow(page, WINDOW_MS, async () => {
      await applyPayload(page, zoneRowsWithout('prep', PREP_START, 7, removeNum));
    });
  });

  test('ready 1080p reverse backfill', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await primeBoardForAnimation(page);
    const { removeNum } = backfillRemovalCase(READY_START, REMOVE_OFFSET);
    await applyPayload(page, zoneRows('ready', READY_START, 7));
    await page.waitForTimeout(400);
    await assertBackfillQaAuditWindow(page, WINDOW_MS, async () => {
      await applyPayload(page, zoneRowsWithout('ready', READY_START, 7, removeNum));
    });
  });

  test('prep 4K reverse backfill', async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await primeBoardForAnimation(page);
    const start = PREP_START + 10;
    const { removeNum, backfillNum } = backfillRemovalCase(start, REMOVE_OFFSET);
    const backfillItemId = 'store:' + backfillNum;
    await applyPayload(page, zoneRows('prep', start, 7));
    await page.waitForTimeout(400);
    await assertBackfillChipStaysInCreamEveryFrame(page, 'prep', backfillItemId, async () => {
      await applyPayload(page, zoneRowsWithout('prep', start, 7, removeNum));
    });
  });
});
