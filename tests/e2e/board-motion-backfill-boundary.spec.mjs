import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import {
  GRID_ROWS,
  RIGHT_TOP_SLOT,
  LEFT_BOTTOM_SLOT,
  RIGHT_BOTTOM_SLOT,
  backfillRemovalCase,
  prepPayload,
  readyPayload,
  applyPayload,
  pollBackfillRemoval,
  assertUpwardExitFade,
  assertEnterFromBelowMotion,
  assertVerticalSlideUp,
  assertNoOverlapDuringBackfill,
  assertVerticalOnlyWhileVisible,
  assertOneChipPerCellDuringBackfill,
  assertZoneSlotOrderExact,
  assertChipsOpaqueAndUnique,
  chipMotionSampleRightTop,
  chipMotionSampleColumnSlot,
  chipMotionSampleLeftBottomMotion,
  pollPayloadMotionSamples,
  zoneRows,
  zoneRowsWithout,
} from './board-motion-backfill-helpers.mjs';
import { chipMotionSampleAtSlot } from './board-column-move-helpers.mjs';
import {
  chipPositionDrift,
  sampleChipMotionDuring,
  findOverlappingChipPairs,
} from './board-motion-7-helpers.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), '../../artifacts/board-motion-2-3');
const PREP_START = 5200;
const READY_START = 5300;
const REMOVE_OFFSET = 3;

test.describe('reverse backfill boundary 1–10 (left leave → right-top backfills left-bottom)', () => {
  test.beforeAll(() => {
    mkdirSync(join(ART, 'screenshots'), { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await primeBoardForAnimation(page);
  });

  test('1 prep: right-top chip slides up and out (fade, vertical only)', async ({ page }) => {
    const { removeNum } = backfillRemovalCase(PREP_START, REMOVE_OFFSET);
    const samples = await pollBackfillRemoval(
      page,
      'prep',
      PREP_START,
      removeNum,
      () => chipMotionSampleRightTop(page, 'prep'),
    );
    assertUpwardExitFade(samples.map((s) => s).filter(Boolean));
  });

  test('2 prep: same chip enters left-bottom from below moving up', async ({ page }) => {
    const { removeNum, backfillNum } = backfillRemovalCase(PREP_START, REMOVE_OFFSET);
    const samples = await pollBackfillRemoval(
      page,
      'prep',
      PREP_START,
      removeNum,
      () => chipMotionSampleLeftBottomMotion(page, 'prep', backfillNum),
    );
    assertEnterFromBelowMotion(samples.filter(Boolean));
  });

  test('3 prep: other right-column chips slide up one cell', async ({ page }) => {
    const { removeNum } = backfillRemovalCase(PREP_START, REMOVE_OFFSET);
    const samples = await pollBackfillRemoval(page, 'prep', PREP_START, removeNum, () =>
      chipMotionSampleColumnSlot(page, 'prep', RIGHT_TOP_SLOT + 1),
    );
    assertVerticalSlideUp(samples.filter(Boolean));
  });

  test('4 ready: right-top chip slides up and out (fade, vertical only)', async ({ page }) => {
    const { removeNum } = backfillRemovalCase(READY_START, REMOVE_OFFSET);
    const samples = await pollBackfillRemoval(
      page,
      'ready',
      READY_START,
      removeNum,
      () => chipMotionSampleRightTop(page, 'ready'),
    );
    assertUpwardExitFade(samples.filter(Boolean));
  });

  test('5 ready: same chip enters left-bottom from below moving up', async ({ page }) => {
    const { removeNum, backfillNum } = backfillRemovalCase(READY_START, REMOVE_OFFSET);
    const samples = await pollBackfillRemoval(
      page,
      'ready',
      READY_START,
      removeNum,
      () => chipMotionSampleLeftBottomMotion(page, 'ready', backfillNum),
    );
    assertEnterFromBelowMotion(samples.filter(Boolean));
  });

  test('6 ready: other right-column chips slide up one cell', async ({ page }) => {
    const { removeNum, rightColFollower } = backfillRemovalCase(READY_START, REMOVE_OFFSET);
    expect(rightColFollower).toBeTruthy();
    await applyPayload(page, zoneRows('ready', READY_START, 7));
    await page.waitForTimeout(400);
    const sampling = sampleChipMotionDuring(page, 1200, 30);
    await applyPayload(page, zoneRowsWithout('ready', READY_START, 7, removeNum));
    const frames = await sampling;
    const tops = [];
    for (const frame of frames) {
      const c = frame.chips.find(
        (x) => x.num === String(rightColFollower) && x.zone.includes('ready') && Number.parseFloat(x.opacity) > 0.15,
      );
      if (c) {
        tops.push(c.top);
      }
    }
    expect(Math.max(...tops) - Math.min(...tops), JSON.stringify(tops)).toBeGreaterThan(8);
  });

  test('7 prep and ready: vertical-only while visible; no chip crosses another', async ({ page }) => {
    const prepCase = backfillRemovalCase(PREP_START, REMOVE_OFFSET);
    const readyCase = backfillRemovalCase(READY_START, REMOVE_OFFSET);
    await applyPayload(page, [...zoneRows('prep', PREP_START, 7), ...zoneRows('ready', READY_START, 7)]);
    await page.waitForTimeout(400);
    const hits = [];
    const trackNums = [prepCase.rightColFollower, readyCase.rightColFollower].filter(Boolean).map(String);
    const sampling = sampleChipMotionDuring(page, 1200, 30);
    const poll = (async () => {
      for (let i = 0; i < 30; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const overlaps = await findOverlappingChipPairs(page);
        if (overlaps.length) {
          hits.push(...overlaps);
        }
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(18);
      }
    })();
    await applyPayload(page, [
      ...zoneRowsWithout('prep', PREP_START, 7, prepCase.removeNum),
      ...zoneRowsWithout('ready', READY_START, 7, readyCase.removeNum),
    ]);
    await poll;
    const samples = await sampling;
    expect(hits, JSON.stringify(hits)).toEqual([]);
    for (const num of trackNums) {
      const zoneKey = num.startsWith(String(PREP_START)) ? 'prep' : 'ready';
      const points = [];
      for (const frame of samples) {
        const c = frame.chips.find((x) => x.num === num && x.zone.includes(zoneKey));
        if (c && Number.parseFloat(c.opacity) > 0.2) {
          points.push(c);
        }
      }
      const tops = points.map((p) => p.top);
      if (tops.length >= 2) {
        expect(Math.max(...tops) - Math.min(...tops), `${num} vertical slide`).toBeGreaterThan(6);
      }
      for (const p of points) {
        if (Number.parseFloat(p.opacity) <= 0.85 || p.floating) {
          continue;
        }
        const tr = p.transform && p.transform !== 'none' ? p.transform : '';
        const m = tr.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+),\s*([^)]+)\)/);
        const tx = m ? Math.abs(Number.parseFloat(m[1]) || 0) : 0;
        expect(tx, `${num} horizontal transform while visible ${JSON.stringify(p)}`).toBeLessThan(2);
      }
    }
  });

  test('8 prep and ready: one chip per cell throughout backfill', async ({ page }) => {
    const prepCase = backfillRemovalCase(PREP_START, REMOVE_OFFSET);
    const readyCase = backfillRemovalCase(READY_START, REMOVE_OFFSET);
    await assertOneChipPerCellDuringBackfill(page, 'prep', PREP_START, prepCase.removeNum);
    await primeBoardForAnimation(page);
    await assertOneChipPerCellDuringBackfill(page, 'ready', READY_START, readyCase.removeNum);
  });

  test('9 prep and ready: after settle exact slot order and opacity 1', async ({ page }) => {
    const prepCase = backfillRemovalCase(PREP_START, REMOVE_OFFSET);
    const readyCase = backfillRemovalCase(READY_START, REMOVE_OFFSET);
    await applyPayload(page, zoneRows('prep', PREP_START, 7));
    await page.waitForTimeout(400);
    await applyPayload(page, zoneRowsWithout('prep', PREP_START, 7, prepCase.removeNum));
    await page.waitForTimeout(500);
    await assertZoneSlotOrderExact(page, 'prep');
    await applyPayload(page, zoneRows('ready', READY_START, 7));
    await page.waitForTimeout(400);
    await applyPayload(page, zoneRowsWithout('ready', READY_START, 7, readyCase.removeNum));
    await page.waitForTimeout(4500);
    await assertZoneSlotOrderExact(page, 'ready');
    await assertChipsOpaqueAndUnique(page);
  });

  test('10 1080p + 4K mid-move contact sheets (prep backfill)', async ({ page }) => {
    const { removeNum } = backfillRemovalCase(PREP_START, REMOVE_OFFSET);
    for (const view of [
      { w: 1920, h: 1080, tag: '1080p' },
      { w: 3840, h: 2160, tag: '4k' },
    ]) {
      await page.setViewportSize({ width: view.w, height: view.h });
      await primeBoardForAnimation(page);
      await applyPayload(page, zoneRows('prep', PREP_START, 7));
      await page.waitForTimeout(350);
      await applyPayload(page, zoneRowsWithout('prep', PREP_START, 7, removeNum));
      await page.waitForTimeout(120);
      const path = join(ART, 'screenshots', `backfill-prep-${view.tag}.png`);
      await page.screenshot({ path, fullPage: false });
      writeFileSync(join(ART, `contact-sheet-${view.tag}.txt`), path + '\n', 'utf8');
      expect(path).toContain(view.tag);
    }
  });

  test('page 2 first number fades in place in right-bottom on backfill shrink', async ({ page }) => {
    const start = 8100;
    const removeNum = String(start + REMOVE_OFFSET);
    const pageTwoFirst = String(start + 10);
    const before = prepRowsFrom(start, 11);
    const after = before.filter((r) => r.number !== removeNum);
    await applyPayload(page, before);
    await page.waitForTimeout(500);
    const slotFadeSamples = await pollPayloadMotionSamples(page, before, after, () =>
      chipMotionSampleAtSlot(page, 'prep', RIGHT_BOTTOM_SLOT),
    );
    const fadedSlot = slotFadeSamples.filter(
      (s) => s && Number.parseFloat(s.opacity) < 0.95 && Number.parseFloat(s.opacity) > 0.05,
    );
    expect(fadedSlot.length, JSON.stringify(slotFadeSamples.filter(Boolean).slice(0, 8))).toBeGreaterThan(0);
    const sampling = sampleChipMotionDuring(page, 400, 35);
    await applyPayload(page, after);
    const samples = await sampling;
    const { driftPx, points } = chipPositionDrift(samples, pageTwoFirst);
    expect(driftPx, `page-2 fade drift ${JSON.stringify(points)}`).toBeLessThan(3);
  });
});

function prepRowsFrom(start, count) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({ source_type: 'From_Store_Preparing', number: String(start + i) });
  }
  return rows;
}
