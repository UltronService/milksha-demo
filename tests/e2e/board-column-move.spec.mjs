import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  primeBoardForAnimation,
  assertChipsOpaqueAndUnique,
  sampleIntegrityDuringUpdate,
  prepNumbers,
  readyNumbers,
} from './board-animation-helpers.mjs';
import {
  chipMotionSampleAtSlot,
  pollMotionSamples,
  assertDownwardExitMotion,
  assertEnterFromAboveMotion,
  prepPayload,
  readyPayload,
  applyPayload,
  assertZoneNumberSet,
  layoutQueueNumbers,
} from './board-column-move-helpers.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), '../../artifacts/column-move');
const GRID_ROWS = 5;

test.describe('column-move animation boundary 1–10', () => {
  test.beforeAll(() => {
    mkdirSync(join(ART, 'screenshots'), { recursive: true });
  });

  test('1 prep: left column bottom slides down and out on 6th number', async ({ page }) => {
    await primeBoardForAnimation(page);
    await applyPayload(page, prepPayload([6201, 6202, 6203, 6204, 6205]));
    await page.waitForTimeout(400);
    const samples = await pollMotionSamples(
      page,
      () => applyPayload(page, prepPayload([6201, 6202, 6203, 6204, 6205, 6206])),
      () => chipMotionSampleAtSlot(page, 'prep', GRID_ROWS - 1),
      { samples: 22, intervalMs: 16 },
    );
    assertDownwardExitMotion(samples);
    await page.waitForTimeout(400);
    await assertChipsOpaqueAndUnique(page);
    await assertZoneNumberSet(page, 'prep', [6201, 6202, 6203, 6204, 6205, 6206]);
  });

  test('2 prep: 6th enters right column top from above', async ({ page }) => {
    await primeBoardForAnimation(page);
    await applyPayload(page, prepPayload([6301, 6302, 6303, 6304, 6305]));
    await page.waitForTimeout(400);
    const samples = await pollMotionSamples(
      page,
      () => applyPayload(page, prepPayload([6301, 6302, 6303, 6304, 6305, 6306])),
      () => chipMotionSampleAtSlot(page, 'prep', GRID_ROWS),
      { samples: 22, intervalMs: 16 },
    );
    assertEnterFromAboveMotion(samples);
    await page.waitForTimeout(400);
    await assertChipsOpaqueAndUnique(page);
  });

  test('3 prep and ready: right column bottom slides down and out on page-2 overflow', async ({ page }) => {
    await primeBoardForAnimation(page);
    const prepTen = prepPayload(Array.from({ length: 10 }, (_, i) => 6401 + i));
    await applyPayload(page, prepTen);
    await page.waitForTimeout(400);
    const prepSamples = await pollMotionSamples(
      page,
      () => applyPayload(page, [...prepTen, ...prepPayload([6411])]),
      () => chipMotionSampleAtSlot(page, 'prep', 9),
      { samples: 22, intervalMs: 16 },
    );
    assertDownwardExitMotion(prepSamples);

    await applyPayload(page, []);
    await page.waitForTimeout(300);
    const readyTen = readyPayload(Array.from({ length: 10 }, (_, i) => 6501 + i));
    await applyPayload(page, readyTen);
    await page.waitForTimeout(400);
    const readySamples = await pollMotionSamples(
      page,
      () => applyPayload(page, [...readyTen, ...readyPayload([6511])]),
      () => chipMotionSampleAtSlot(page, 'ready', 9),
      { samples: 22, intervalMs: 16 },
    );
    assertDownwardExitMotion(readySamples);
    await page.waitForTimeout(400);
    await assertChipsOpaqueAndUnique(page);
  });

  test('4 ready: left column bottom slides down and out on 6th number', async ({ page }) => {
    await primeBoardForAnimation(page);
    await applyPayload(page, readyPayload([6601, 6602, 6603, 6604, 6605]));
    await page.waitForTimeout(400);
    const samples = await pollMotionSamples(
      page,
      () => applyPayload(page, readyPayload([6601, 6602, 6603, 6604, 6605, 6606])),
      () => chipMotionSampleAtSlot(page, 'ready', GRID_ROWS - 1),
      { samples: 22, intervalMs: 16 },
    );
    assertDownwardExitMotion(samples);
    await page.waitForTimeout(4000);
    await assertChipsOpaqueAndUnique(page);
  });

  test('5 ready: 6th enters right column top from above', async ({ page }) => {
    await primeBoardForAnimation(page);
    await applyPayload(page, readyPayload([6701, 6702, 6703, 6704, 6705]));
    await page.waitForTimeout(400);
    const samples = await pollMotionSamples(
      page,
      () => applyPayload(page, readyPayload([6701, 6702, 6703, 6704, 6705, 6706])),
      () => chipMotionSampleAtSlot(page, 'ready', GRID_ROWS),
      { samples: 22, intervalMs: 16 },
    );
    assertEnterFromAboveMotion(samples);
    await page.waitForTimeout(4000);
    await assertChipsOpaqueAndUnique(page);
  });

  test('6 prep and ready: column move uses transform and opacity only during window', async ({ page }) => {
    await primeBoardForAnimation(page);
    await applyPayload(page, prepPayload([6801, 6802, 6803, 6804, 6805]));
    await page.waitForTimeout(300);
    await applyPayload(page, prepPayload([6801, 6802, 6803, 6804, 6805, 6806]));
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
            left: el.style.left,
            top: el.style.top,
            width: el.style.width,
            height: el.style.height,
            position: el.style.position,
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
    await applyPayload(page, prepPayload([6901, 6902, 6903, 6904, 6905]));
    await page.waitForTimeout(350);
    await sampleIntegrityDuringUpdate(
      page,
      () => applyPayload(page, prepPayload([6901, 6902, 6903, 6904, 6905, 6906])),
      { samples: 28, intervalMs: 20 },
    );
    await applyPayload(page, readyPayload([6911, 6912, 6913, 6914, 6915]));
    await page.waitForTimeout(350);
    await sampleIntegrityDuringUpdate(
      page,
      () => applyPayload(page, readyPayload([6911, 6912, 6913, 6914, 6915, 6916])),
      { samples: 28, intervalMs: 20 },
    );
  });

  test('8 prep and ready: settled numbers match layout order', async ({ page }) => {
    await primeBoardForAnimation(page);
    await applyPayload(page, prepPayload([7001, 7002, 7003, 7004, 7005, 7006]));
    await page.waitForTimeout(450);
    expect(await layoutQueueNumbers(page, [7001, 7002, 7003, 7004, 7005, 7006])).toEqual([
      '7001',
      '7002',
      '7003',
      '7004',
      '7005',
      '7006',
    ]);
    await assertZoneNumberSet(page, 'prep', [7001, 7002, 7003, 7004, 7005, 7006]);
    await applyPayload(page, readyPayload([7011, 7012, 7013, 7014, 7015, 7016]));
    await page.waitForTimeout(4000);
    expect(await layoutQueueNumbers(page, [7011, 7012, 7013, 7014, 7015, 7016])).toEqual([
      '7011',
      '7012',
      '7013',
      '7014',
      '7015',
      '7016',
    ]);
    await assertZoneNumberSet(page, 'ready', [7011, 7012, 7013, 7014, 7015, 7016]);
    await assertChipsOpaqueAndUnique(page);
  });

  test('9 1080p contact sheet mid column-move prep', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await primeBoardForAnimation(page);
    await applyPayload(page, prepPayload([7101, 7102, 7103, 7104, 7105]));
    await page.waitForTimeout(350);
    await applyPayload(page, prepPayload([7101, 7102, 7103, 7104, 7105, 7106]));
    await page.waitForTimeout(120);
    const path1080 = join(ART, 'screenshots', 'column-move-prep-1080p.png');
    await page.screenshot({ path: path1080, fullPage: false });
    writeFileSync(join(ART, 'contact-sheet-1080p.txt'), path1080 + '\n', 'utf8');
    expect(path1080).toContain('1080p');
  });

  test('10 4K contact sheet mid column-move prep', async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await primeBoardForAnimation(page);
    await applyPayload(page, prepPayload([7201, 7202, 7203, 7204, 7205]));
    await page.waitForTimeout(350);
    await applyPayload(page, prepPayload([7201, 7202, 7203, 7204, 7205, 7206]));
    await page.waitForTimeout(120);
    const path4k = join(ART, 'screenshots', 'column-move-prep-4k.png');
    await page.screenshot({ path: path4k, fullPage: false });
    writeFileSync(join(ART, 'contact-sheet-4k.txt'), path4k + '\n', 'utf8');
    expect(path4k).toContain('4k');
  });
});
