#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-ready-fade-self-qa');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);

async function measureViewport(page, tag) {
  await page.goto(`http://127.0.0.1:${PORT}/?mode=local`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload));

  async function runScenario(label, payloadBuilder) {
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([], { silent: true });
      window.QMS.runtime.applyPayload([], { silent: true });
    });
    await payloadBuilder(page);
    await page.waitForTimeout(150);
    return page.evaluate((scenarioLabel) => {
      const layer = document.querySelector('.milksha-zone.ready .milksha-zone-numbers');
      const zone = document.querySelector('.milksha-zone.ready');
      const grid =
        document.querySelector('.milksha-ready .milksha-cream-grid') ||
        document.querySelector('.milksha-ready .milksha-zone-numbers');
      const csGrid = grid ? getComputedStyle(grid) : null;
      const cells = [...document.querySelectorAll('.milksha-ready .milksha-num-cell')];
      const chips = [...document.querySelectorAll('.milksha-ready .milksha-board-chip')];
      const sampleCell = cells.find((c) => c.querySelector('.milksha-board-chip')) || cells[0];
      const sampleChip = sampleCell ? sampleCell.querySelector('.milksha-board-chip') : null;
      const num = sampleChip ? sampleChip.querySelector('.milksha-num') : null;
      const cellR = sampleCell ? sampleCell.getBoundingClientRect() : null;
      const chipR = sampleChip ? sampleChip.getBoundingClientRect() : null;
      const numR = num ? num.getBoundingClientRect() : null;
      const zoneR = zone ? zone.getBoundingClientRect() : null;
      const zoneBody = zone ? zone.querySelector('.milksha-zone-body') : null;
      const bodyR = zoneBody ? zoneBody.getBoundingClientRect() : null;
      const scales = chips.map((chip) => {
        const id = chip.getAttribute('data-item-id');
        const s = window.QMS.MilkshaBoardAnimConfig.computeChipPulseScale(chip, layer);
        return { id: id, safeMax: Math.round(s * 1000) / 1000 };
      });
      const layerMin = window.QMS.MilkshaBoardAnimConfig.computeSafeReadyScale(layer);
      return {
        scenario: scenarioLabel,
        chipCount: chips.length,
        geometry: {
          columnGapPx: csGrid ? parseFloat(csGrid.columnGap) || 0 : null,
          rowGapPx: csGrid ? parseFloat(csGrid.rowGap) || 0 : null,
          cellWidthPx: cellR ? Math.round(cellR.width) : null,
          cellHeightPx: cellR ? Math.round(cellR.height) : null,
          chipWidthPx: chipR ? Math.round(chipR.width) : null,
          chipHeightPx: chipR ? Math.round(chipR.height) : null,
          numWidthPx: numR ? Math.round(numR.width) : null,
          zonePaddingLeftPx: bodyR && zoneR ? Math.round(bodyR.left - zoneR.left) : null,
          zonePaddingRightPx: bodyR && zoneR ? Math.round(zoneR.right - bodyR.right) : null,
        },
        layerSafeMin: Math.round(layerMin * 1000) / 1000,
        perChipSafeMax: scales,
      };
    }, label);
  }

  const full = await runScenario('full-10x-9999', async (p) => {
    const batch = [];
    for (let i = 0; i < 10; i += 1) {
      batch.push({ source_type: 'From_Store_OK', number: '999' + i });
    }
    await p.evaluate((b) => window.QMS.runtime.applyPayload(b), batch);
  });

  const one = await runScenario('one-chip-corner', async (p) => {
    await p.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '1001' }]);
    });
  });

  const three = await runScenario('three-chips', async (p) => {
    await p.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_OK', number: '2001' },
        { source_type: 'From_Store_OK', number: '2002' },
        { source_type: 'From_Store_OK', number: '2003' },
      ]);
    });
  });

  const cornerPulse = await runScenario('one-new-on-full-grid', async (p) => {
    const batch = [];
    for (let i = 0; i < 10; i += 1) {
      batch.push({ source_type: 'From_Store_OK', number: '888' + i });
    }
    await p.evaluate((b) => window.QMS.runtime.applyPayload(b), batch);
    await p.waitForTimeout(200);
    await p.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '9999' },
        { source_type: 'From_Store_OK', number: '9999' },
      ]);
    });
  });

  return { viewport: tag, scenarios: [full, one, three, cornerPulse] };
}

async function main() {
  const { startSite } = await import('../tests/e2e/harness.mjs');
  await startSite();
  mkdirSync(join(ART, 'screenshots'), { recursive: true });
  const browser = await chromium.launch();
  const out = { generatedAt: new Date().toISOString(), viewports: [] };
  for (const vp of [{ width: 1920, height: 1080, tag: '1920x1080' }, { width: 3840, height: 2160, tag: '3840x2160' }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    out.viewports.push(await measureViewport(page, vp.tag));
    await ctx.close();
  }
  await browser.close();
  const path = join(ART, 'safe-scale-measurements.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  const metricsPath = join(ART, 'metrics.json');
  const base = existsSync(metricsPath) ? JSON.parse(readFileSync(metricsPath, 'utf8')) : {};
  base.safeScaleMeasurements = out;
  writeFileSync(metricsPath, JSON.stringify(base, null, 2));
  console.log('wrote', path);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
