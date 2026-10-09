#!/usr/bin/env node
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-ready-fade-self-qa', 'screenshots');
const REPORT_JSON = join(ROOT, 'artifacts', 'board-ready-fade-self-qa', 'pulse-gap-report.json');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);

async function main() {
  const gapReport = JSON.parse(readFileSync(REPORT_JSON, 'utf8'));
  const helpers = await import('../tests/e2e/board-ready-scale-overlap-helpers.mjs');
  const { startSite } = await import('../tests/e2e/harness.mjs');
  await startSite();
  mkdirSync(ART, { recursive: true });

  const browser = await chromium.launch();
  const manifest = { generatedAt: new Date().toISOString(), shots: [] };

  for (const vp of gapReport.viewports) {
    const worst = vp.worstCell;
    const vpSize = vp.viewport === '3840x2160' ? { width: 3840, height: 2160 } : { width: 1920, height: 1080 };
    const ctx = await browser.newContext({ viewport: vpSize });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/?mode=local`);
    await helpers.openBoardForOverlap(page);
    const itemId = helpers.itemIdForNumber(worst.number);
    await helpers.triggerPulseAtCell(page, worst.cellIndex);
    await helpers.waitForPulseHold(page, itemId, 1.3);
    const base = `${vp.viewport}-fullboard-scale-1_3-worst-cell-${worst.cellIndex}-gap-${String(worst.minNeighborGapPx).replace('.', '_')}`;
    const fullName = `${base}.png`;
    await page.screenshot({ path: join(ART, fullName), fullPage: false });

    const clip = await page.evaluate((id) => {
      const pulse = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
      if (!pulse) {
        return null;
      }
      const layer = document.querySelector('.milksha-zone.ready .milksha-zone-numbers');
      const cells = layer ? [...layer.querySelectorAll('.milksha-num-cell')] : [];
      const cell = pulse.closest('.milksha-num-cell');
      const idx = cell ? cells.indexOf(cell) : -1;
      const neighbors = [];
      if (idx >= 0) {
        if (idx % 2 === 0 && cells[idx + 1]) {
          neighbors.push(cells[idx + 1]);
        }
        if (idx % 2 === 1 && cells[idx - 1]) {
          neighbors.push(cells[idx - 1]);
        }
        if (idx >= 2) {
          neighbors.push(cells[idx - 2]);
        }
        if (idx + 2 < cells.length) {
          neighbors.push(cells[idx + 2]);
        }
      }
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      const add = (el) => {
        if (!el) {
          return;
        }
        const r = el.getBoundingClientRect();
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      };
      add(pulse);
      neighbors.forEach((c) => add(c.querySelector('.milksha-board-chip') || c));
      const pad = 12;
      return {
        x: Math.max(0, Math.floor(left - pad)),
        y: Math.max(0, Math.floor(top - pad)),
        width: Math.ceil(right - left + pad * 2),
        height: Math.ceil(bottom - top + pad * 2),
      };
    }, itemId);

    let zoomName = null;
    if (clip && clip.width > 0) {
      zoomName = `${base}-zoom2x.png`;
      const zoomCtx = await browser.newContext({ viewport: vpSize, deviceScaleFactor: 2 });
      const zoomPage = await zoomCtx.newPage();
      await zoomPage.goto(`http://127.0.0.1:${PORT}/?mode=local`);
      await helpers.openBoardForOverlap(zoomPage);
      await helpers.triggerPulseAtCell(zoomPage, worst.cellIndex);
      await helpers.waitForPulseHold(zoomPage, itemId, 1.3);
      await zoomPage.screenshot({
        path: join(ART, zoomName),
        clip: {
          x: clip.x + clip.width / 4,
          y: clip.y + clip.height / 4,
          width: clip.width / 2,
          height: clip.height / 2,
        },
      });
      await zoomCtx.close();
    }

    manifest.shots.push({
      viewport: vp.viewport,
      cellIndex: worst.cellIndex,
      number: worst.number,
      minNeighborGapPx: worst.minNeighborGapPx,
      scale: 1.3,
      fullboard: fullName,
      zoom2x: zoomName,
    });
    await ctx.close();
  }

  writeFileSync(join(ART, 'fullboard-scale-manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log('wrote fullboard shots', manifest.shots);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
