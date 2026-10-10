#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-ready-fade-self-qa');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);

async function importHelpers() {
  const mod = await import('../tests/e2e/board-ready-scale-overlap-helpers.mjs');
  return mod;
}

async function main() {
  const {
    openBoardForOverlap,
    triggerPulseAtCell,
    waitForPulseHold,
    measurePulseOverlap,
    itemIdForNumber,
    numberForCellIndex,
  } = await importHelpers();
  const { startSite } = await import('../tests/e2e/harness.mjs');
  await startSite();

  const report = { generatedAt: new Date().toISOString(), viewports: [] };
  const browser = await chromium.launch();

  for (const vp of [{ width: 1920, height: 1080, tag: '1920x1080' }, { width: 3840, height: 2160, tag: '3840x2160' }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/?mode=local`);
    await openBoardForOverlap(page);

    const positions = [];
    for (let cellIndex = 0; cellIndex < 10; cellIndex += 1) {
      const num = numberForCellIndex(cellIndex);
      const itemId = itemIdForNumber(num);
      await triggerPulseAtCell(page, cellIndex);
      await page.waitForFunction(() => document.querySelectorAll('.milksha-ready .milksha-board-chip').length === 10);
      await waitForPulseHold(page, itemId, 1.3);
      const m = await measurePulseOverlap(page, itemId);
      positions.push({
        cellIndex,
        number: num,
        scale: m.scale,
        minNeighborGapPx: m.minNeighborGapPx,
        insideZone: m.insideZone,
        overlaps: m.overlaps,
      });
      if (m.overlaps?.length > 0 || !m.insideZone) {
        console.error('OVERLAP FAIL', vp.tag, positions[positions.length - 1]);
        process.exit(2);
      }
    }
    const minGap = Math.min(...positions.map((p) => p.minNeighborGapPx ?? Infinity));
    const worst = positions.find((p) => p.minNeighborGapPx === minGap);
    report.viewports.push({ viewport: vp.tag, positions, minNeighborGapPx: minGap, worstCell: worst });
    await ctx.close();
  }

  await browser.close();
  mkdirSync(ART, { recursive: true });
  const outPath = join(ART, 'pulse-gap-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('wrote', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
