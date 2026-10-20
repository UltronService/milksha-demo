import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import {
  applyPayload,
  prepPayload,
  readyPayload,
  sequentialNumbers,
  leftBottomNumber,
} from './board-column-move-helpers.mjs';
import {
  assertChipStaysInsideCreamDuringColumnMove,
  assertQaMotionBoundaryDuringColumnMove,
  runQaProbeCollectOnly,
} from './board-colmove-clip-helpers.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), '../../artifacts/board-colmove-clip');

test.describe('column-move cream clip + overlap (RED on main)', () => {
  test.beforeAll(() => {
    mkdirSync(join(ART, 'screenshots'), { recursive: true });
  });

  test('minimal red: prep 1080p 5→6 pushed chip never leaves cream / title', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(8201, 5);
    const pushed = leftBottomNumber(nums);
    await applyPayload(page, prepPayload(nums));
    await page.waitForTimeout(350);
    await assertChipStaysInsideCreamDuringColumnMove(page, 'prep', pushed, () =>
      applyPayload(page, prepPayload([...nums, nums[nums.length - 1] + 1])),
    );
  });

  test('d32 overlap red: new top-left fade-in vs sliding incumbent (0034/0030 class)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(8401, 5);
    const incumbentTop = String(nums[0]);
    const newest = String(nums[nums.length - 1] + 1);
    await applyPayload(page, prepPayload(nums));
    await page.waitForTimeout(350);
    await assertQaMotionBoundaryDuringColumnMove(
      page,
      'prep',
      () => applyPayload(page, prepPayload([...nums, Number(newest)])),
      {
        settleMs: 520,
        trackItemIds: ['store:' + newest, 'store:' + incumbentTop],
      },
    );
  });

  test('timing red: new chip visible while cell still occupied by sliding chip', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(8501, 5);
    await applyPayload(page, prepPayload(nums));
    await page.waitForTimeout(350);
    const result = await runQaProbeCollectOnly(page, 'prep', () =>
      applyPayload(page, prepPayload([...nums, nums[nums.length - 1] + 1])),
    );
    const cellViolations = result.violations.filter((v) => v.kind === 'cell-double-occupy');
    const overlapViolations = result.violations.filter((v) => v.kind === 'chip-overlap');
    expect(
      cellViolations.length + overlapViolations.length,
      JSON.stringify({ cellViolations, overlapViolations }, null, 2),
    ).toBeGreaterThan(0);
  });

  for (const viewport of [
    { label: '1080p', width: 1920, height: 1080 },
    { label: '4k', width: 3840, height: 2160 },
  ]) {
    for (const zone of ['prep', 'ready']) {
      test(`${zone} ${viewport.label}: QA A.2 full motion boundary`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await primeBoardForAnimation(page);
        const base = zone === 'prep' ? 8300 : 9300;
        const nums = sequentialNumbers(base + (viewport.label === '4k' ? 10 : 0), 5);
        const pushed = leftBottomNumber(nums);
        const payloadFn = zone === 'prep' ? prepPayload : readyPayload;
        await applyPayload(page, payloadFn(nums));
        await page.waitForTimeout(350);
        await assertQaMotionBoundaryDuringColumnMove(
          page,
          zone,
          () => applyPayload(page, payloadFn([...nums, nums[nums.length - 1] + 1])),
          { settleMs: zone === 'ready' ? 900 : 520 },
        );
        writeFileSync(
          join(ART, `sample-meta-${zone}-${viewport.label}.json`),
          JSON.stringify({ zone, viewport: viewport.label, pushed }, null, 2),
          'utf8',
        );
      });
    }
  }

  test('ready 1080p: QA during column-move includes 1.3x pulse window (A.4)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(8601, 5);
    await applyPayload(page, readyPayload(nums));
    await page.waitForTimeout(350);
    await assertQaMotionBoundaryDuringColumnMove(
      page,
      'ready',
      () => applyPayload(page, readyPayload([...nums, nums[nums.length - 1] + 1])),
      { settleMs: 4200 },
    );
  });
});

test.describe('QA acceptance checklist A on main (record-only)', () => {
  test('record A.1–A.4 column-move prep+ready → ACCEPTANCE-MAIN.json', async ({ page }) => {
    const rows = [];
    for (const viewport of [
      { label: '1080p', width: 1920, height: 1080 },
      { label: '4k', width: 3840, height: 2160 },
    ]) {
      for (const zone of ['prep', 'ready']) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await primeBoardForAnimation(page);
        const base = zone === 'prep' ? 8700 : 9700;
        const nums = sequentialNumbers(base, 5);
        const payloadFn = zone === 'prep' ? prepPayload : readyPayload;
        await applyPayload(page, payloadFn(nums));
        await page.waitForTimeout(350);
        const result = await runQaProbeCollectOnly(
          page,
          zone,
          () => applyPayload(page, payloadFn([...nums, nums[nums.length - 1] + 1])),
          zone === 'ready' ? 4200 : 520,
        );
        rows.push({
          viewport: viewport.label,
          zone,
          frameCount: result.frameCount,
          fail: result.violations.length > 0,
          byKind: result.byKind,
          sampleViolation: result.violations[0] ?? null,
        });
      }
    }
    writeFileSync(join(ART, 'ACCEPTANCE-MAIN.json'), JSON.stringify(rows, null, 2), 'utf8');
    expect(rows.every((r) => r.frameCount > 8)).toBe(true);
  });
});
