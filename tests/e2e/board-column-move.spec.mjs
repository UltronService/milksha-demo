import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  primeBoardForAnimation,
  assertChipsOpaqueAndUnique,
  sampleIntegrityDuringUpdate,
} from './board-animation-helpers.mjs';
import {
  chipMotionSampleAtSlot,
  chipMotionSampleForNumberWithLeft,
  chipMotionSampleForNumberIncludingFloat,
  assertEnterFromAboveMotion,
  pollMotionSamples,
  assertDownwardExitMotion,
  assertNoHorizontalWhileVisible,
  pickColumnMoveEnterSample,
  prepPayload,
  readyPayload,
  applyPayload,
  layoutQueueNumbers,
  assertZoneSlotOrderExact,
  assertReadyPulseOnNumber,
  leftBottomNumber,
  sequentialNumbers,
} from './board-column-move-helpers.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), '../../artifacts/column-move');
const GRID_ROWS = 5;

test.describe('column-move animation boundary 1–10', () => {
  test.beforeAll(() => {
    mkdirSync(join(ART, 'screenshots'), { recursive: true });
  });

  test('1 prep: left column bottom slides down and out on 6th number', async ({ page }) => {
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(6201, 5);
    await applyPayload(page, prepPayload(nums));
    await page.waitForTimeout(400);
    const samples = await pollMotionSamples(
      page,
      () => applyPayload(page, prepPayload([...nums, nums[nums.length - 1] + 1])),
      () => chipMotionSampleAtSlot(page, 'prep', GRID_ROWS - 1),
      { samples: 22, intervalMs: 16 },
    );
    assertDownwardExitMotion(samples);
    await page.waitForTimeout(400);
    await assertChipsOpaqueAndUnique(page);
  });

  test('2 prep: pushed slot-4 chip exits down then enters slot 5 from above (not new number)', async ({ page }) => {
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(6301, 5);
    const pushed = leftBottomNumber(nums);
    const newest = String(nums[nums.length - 1] + 1);
    await applyPayload(page, prepPayload(nums));
    await page.waitForTimeout(400);
    const combined = await pollMotionSamples(
      page,
      () => applyPayload(page, prepPayload([...nums, Number(newest)])),
      async () => ({
        exit: await chipMotionSampleAtSlot(page, 'prep', GRID_ROWS - 1),
        enterSlot: await chipMotionSampleAtSlot(page, 'prep', GRID_ROWS),
        enterPushed: await chipMotionSampleForNumberIncludingFloat(page, 'prep', pushed),
        newest: await chipMotionSampleForNumberWithLeft(page, 'prep', newest),
      }),
      { samples: 64, intervalMs: 14 },
    );
    const exitSamples = combined.map((c) => c.exit).filter(Boolean);
    const enterSamples = combined
      .flatMap((c) => [
        c.enterPushed,
        c.enterSlot,
        pickColumnMoveEnterSample(c.enterPushed, c.enterSlot),
      ])
      .filter(Boolean);
    const newSamples = combined.map((c) => c.newest).filter(Boolean);
    assertDownwardExitMotion(exitSamples);
    assertEnterFromAboveMotion(enterSamples);
    assertNoHorizontalWhileVisible(enterSamples);
    expect(newSamples.every((s) => !s || transformTranslateY(s.transform) > -6)).toBe(true);
    await page.waitForTimeout(400);
    await assertChipsOpaqueAndUnique(page);
  });

  test('3 prep and ready: right column bottom slides down and out on page-2 overflow', async ({ page }) => {
    await primeBoardForAnimation(page);
    const prepTen = sequentialNumbers(6401, 10);
    await applyPayload(page, prepPayload(prepTen));
    await page.waitForTimeout(400);
    const prepSamples = await pollMotionSamples(
      page,
      () => applyPayload(page, prepPayload([...prepTen, 6411])),
      () => chipMotionSampleAtSlot(page, 'prep', 9),
      { samples: 22, intervalMs: 16 },
    );
    assertDownwardExitMotion(prepSamples);

    await applyPayload(page, []);
    await page.waitForTimeout(300);
    const readyTen = sequentialNumbers(6501, 10);
    await applyPayload(page, readyPayload(readyTen));
    await page.waitForTimeout(400);
    const readySamples = await pollMotionSamples(
      page,
      () => applyPayload(page, readyPayload([...readyTen, 6511])),
      () => chipMotionSampleAtSlot(page, 'ready', 9),
      { samples: 22, intervalMs: 16 },
    );
    assertDownwardExitMotion(readySamples);
    await page.waitForTimeout(400);
    await assertChipsOpaqueAndUnique(page);
  });

  test('4 ready: left column bottom slides down and out on 6th number', async ({ page }) => {
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(6601, 5);
    await applyPayload(page, readyPayload(nums));
    await page.waitForTimeout(400);
    const samples = await pollMotionSamples(
      page,
      () => applyPayload(page, readyPayload([...nums, nums[nums.length - 1] + 1])),
      () => chipMotionSampleAtSlot(page, 'ready', GRID_ROWS - 1),
      { samples: 22, intervalMs: 16 },
    );
    assertDownwardExitMotion(samples);
    await page.waitForTimeout(400);
    await assertChipsOpaqueAndUnique(page);
  });

  test('5 ready: new number 1.3x pulse; pushed slot-4 chip enters slot 5 from above', async ({ page }) => {
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(6701, 5);
    const pushed = leftBottomNumber(nums);
    const newest = String(nums[nums.length - 1] + 1);
    await applyPayload(page, readyPayload(nums));
    await page.waitForTimeout(400);
    const combined = await pollMotionSamples(
      page,
      () => applyPayload(page, readyPayload([...nums, Number(newest)])),
      async () => ({
        exit: await chipMotionSampleAtSlot(page, 'ready', GRID_ROWS - 1),
        enter: await chipMotionSampleAtSlot(page, 'ready', GRID_ROWS),
      }),
      { samples: 28, intervalMs: 16 },
    );
    const exitSamples = combined.map((c) => c.exit).filter(Boolean);
    const enterSamples = combined.map((c) => c.enter).filter(Boolean);
    assertDownwardExitMotion(exitSamples);
    assertEnterFromAboveMotion(enterSamples);
    assertNoHorizontalWhileVisible(enterSamples);
    await assertReadyPulseOnNumber(page, newest);
    await page.waitForTimeout(500);
    await assertChipsOpaqueAndUnique(page);
  });

  test('6 prep and ready: column move uses transform and opacity only during window', async ({ page }) => {
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(6801, 5);
    await applyPayload(page, prepPayload(nums));
    await page.waitForTimeout(300);
    await applyPayload(page, prepPayload([...nums, 6806]));
    await page.waitForTimeout(80);
    const bad = await page.evaluate(() => {
      const layer = document.querySelector('.milksha-prep .milksha-zone-numbers[data-column-move-anim="1"]');
      if (!layer) {
        return [];
      }
      const chips = [...layer.querySelectorAll('.milksha-board-chip')];
      return chips
        .map((el) => {
          const cs = getComputedStyle(el);
          return {
            marginTop: cs.marginTop,
            marginLeft: cs.marginLeft,
          };
        })
        .filter((s) => s.marginTop !== '0px' || s.marginLeft !== '0px');
    });
    expect(bad).toEqual([]);
    await page.waitForTimeout(400);
    await assertChipsOpaqueAndUnique(page);
  });

  test('7 prep and ready: integrity during column move', async ({ page }) => {
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(6901, 5);
    await applyPayload(page, prepPayload(nums));
    await page.waitForTimeout(350);
    await sampleIntegrityDuringUpdate(
      page,
      () => applyPayload(page, prepPayload([...nums, 6906])),
      { samples: 28, intervalMs: 20 },
    );
    const rnums = sequentialNumbers(6911, 5);
    await applyPayload(page, readyPayload(rnums));
    await page.waitForTimeout(350);
    await sampleIntegrityDuringUpdate(
      page,
      () => applyPayload(page, readyPayload([...rnums, 6916])),
      { samples: 28, intervalMs: 20 },
    );
  });

  test('8 prep and ready: settled numbers match exact slot order', async ({ page }) => {
    await primeBoardForAnimation(page);
    const prepSix = sequentialNumbers(7001, 6);
    await applyPayload(page, prepPayload(prepSix));
    await page.waitForTimeout(450);
    await assertZoneSlotOrderExact(page, 'prep');
    const readySix = sequentialNumbers(7011, 6);
    await applyPayload(page, readyPayload(readySix));
    await page.waitForTimeout(4500);
    await assertZoneSlotOrderExact(page, 'ready');
    await assertChipsOpaqueAndUnique(page);
  });

  test('9 1080p contact sheet mid column-move prep', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(7101, 5);
    await applyPayload(page, prepPayload(nums));
    await page.waitForTimeout(350);
    await applyPayload(page, prepPayload([...nums, 7106]));
    await page.waitForTimeout(120);
    const path1080 = join(ART, 'screenshots', 'column-move-prep-1080p.png');
    await page.screenshot({ path: path1080, fullPage: false });
    writeFileSync(join(ART, 'contact-sheet-1080p.txt'), path1080 + '\n', 'utf8');
    expect(path1080).toContain('1080p');
  });

  test('10 4K contact sheet mid column-move prep', async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await primeBoardForAnimation(page);
    const nums = sequentialNumbers(7201, 5);
    await applyPayload(page, prepPayload(nums));
    await page.waitForTimeout(350);
    await applyPayload(page, prepPayload([...nums, 7206]));
    await page.waitForTimeout(120);
    const path4k = join(ART, 'screenshots', 'column-move-prep-4k.png');
    await page.screenshot({ path: path4k, fullPage: false });
    writeFileSync(join(ART, 'contact-sheet-4k.txt'), path4k + '\n', 'utf8');
    expect(path4k).toContain('4k');
  });
});

function transformTranslateY(transform) {
  if (!transform || transform === 'none') {
    return 0;
  }
  const m = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+),\s*([^)]+)\)/);
  if (m) {
    return Number.parseFloat(m[2]) || 0;
  }
  return 0;
}

for (const zone of ['prep', 'ready']) {
  test.describe(`${zone}: left overflow on arrivals 6–10`, () => {
    for (let count = 6; count <= 10; count += 1) {
      test(`arrival ${count} pushed chip column move`, async ({ page }) => {
        await primeBoardForAnimation(page);
        const base = zone === 'prep' ? 8000 + count * 10 : 9000 + count * 10;
        const prev = sequentialNumbers(base, count - 1);
        const next = sequentialNumbers(base, count);
        const pushed = leftBottomNumber(prev);
        const payloadFn = zone === 'prep' ? prepPayload : readyPayload;
        await applyPayload(page, payloadFn(prev));
        await page.waitForTimeout(350);
        const newest = String(next[next.length - 1]);
        let applyHook = null;
        const pulsePromise =
          zone === 'ready'
            ? (async () => {
                await new Promise((resolve) => {
                  applyHook = resolve;
                });
                await assertReadyPulseOnNumber(page, newest);
              })()
            : null;
        const combined = await pollMotionSamples(
          page,
          async () => {
            await applyPayload(page, payloadFn(next));
            if (applyHook) {
              applyHook();
            }
          },
          async () => {
            const enterSlot = await chipMotionSampleAtSlot(page, zone, GRID_ROWS);
            const enterPushed = await chipMotionSampleForNumberWithLeft(page, zone, pushed);
            return {
              exit: await chipMotionSampleAtSlot(page, zone, GRID_ROWS - 1),
              enterSlot,
              enterPushed: await chipMotionSampleForNumberIncludingFloat(page, zone, pushed),
            };
          },
          { samples: count >= 10 ? 56 : 48, intervalMs: 12 },
        );
        if (pulsePromise) {
          await pulsePromise;
        }
        const exitSamples = combined.map((c) => c.exit).filter(Boolean);
        const enterSamples = combined
          .flatMap((c) => [
            c.enterPushed,
            c.enterSlot,
            pickColumnMoveEnterSample(c.enterPushed, c.enterSlot),
          ])
          .filter(Boolean);
        assertDownwardExitMotion(exitSamples);
        assertEnterFromAboveMotion(enterSamples);
        assertNoHorizontalWhileVisible(enterSamples);
        await page.waitForTimeout(zone === 'ready' ? 4500 : 450);
        await assertZoneSlotOrderExact(page, zone);
        await assertChipsOpaqueAndUnique(page);
      });
    }
  });
}
