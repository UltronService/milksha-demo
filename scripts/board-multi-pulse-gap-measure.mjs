#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-multi-pulse-gap');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);

const VIEWPORTS = [
  { width: 1920, height: 1080, tag: '1920x1080' },
  { width: 3840, height: 2160, tag: '3840x2160' },
];

async function waitMultiPulseHold(page, minPulsing, expectedScale = 1.3) {
  const inMs = await page.evaluate(() => window.QMS.MilkshaBoardAnimConfig.getConfig().readyScaleInMs);
  await page.waitForTimeout(inMs + 120);
  await page.waitForFunction(
    ({ minCount, lo, hi }) => {
      const chips = [...document.querySelectorAll('.milksha-ready .milksha-board-chip')];
      let pulsing = 0;
      for (let i = 0; i < chips.length; i += 1) {
        const tr = getComputedStyle(chips[i]).transform;
        const m = tr.match(/matrix\(([^)]+)\)/);
        const s = m ? Number.parseFloat(m[1].split(',')[0]) : 1;
        if (s >= lo && s <= hi) {
          pulsing += 1;
        }
      }
      return pulsing >= minCount;
    },
    { minCount: minPulsing, lo: expectedScale - 0.05, hi: expectedScale + 0.05 },
    { timeout: 15000 },
  );
}

async function setupScenario(page, scenarioKey) {
  await page.evaluate((key) => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
    const allTen = [];
    for (let i = 0; i < 10; i += 1) {
      allTen.push({ source_type: 'From_Store_OK', number: String(9990 + i) });
    }
    if (key === 'ten_at_once') {
      window.QMS.runtime.applyPayload(allTen);
      return;
    }
    if (key === 'three_at_once') {
      const seven = [];
      for (let i = 3; i < 10; i += 1) {
        seven.push({ source_type: 'From_Store_OK', number: String(9990 + i) });
      }
      window.QMS.runtime.applyPayload(seven, { silent: true });
      window.QMS.runtime.applyPayload(allTen);
      return;
    }
    if (key === 'two_vertical_adjacent') {
      const prepTwo = [];
      for (let i = 0; i < 10; i += 1) {
        const n = String(9990 + i);
        if (n === '9999' || n === '9998') {
          prepTwo.push({ source_type: 'From_Store_Preparing', number: n });
        } else {
          prepTwo.push({ source_type: 'From_Store_OK', number: n });
        }
      }
      window.QMS.runtime.applyPayload(prepTwo, { silent: true });
      window.QMS.runtime.applyPayload(allTen);
    }
  }, scenarioKey);
}

async function measureHold(page) {
  return page.evaluate(() => {
    const SCALE_MIN = 1.15;
    const zone = document.querySelector('.milksha-zone.ready');
    if (!zone) {
      return { ok: false, reason: 'no ready zone' };
    }
    const zr = zone.getBoundingClientRect();
    const zoneRect = { left: zr.left, right: zr.right, top: zr.top, bottom: zr.bottom };

    function expandedForChip(chip) {
      const tr = getComputedStyle(chip).transform;
      const m = tr.match(/matrix\(([^)]+)\)/);
      const scale = m ? Number.parseFloat(m[1].split(',')[0]) : 1;
      const r = chip.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const ow = chip.offsetWidth;
      const oh = chip.offsetHeight;
      return {
        id: chip.getAttribute('data-item-id'),
        number: chip.querySelector('.milksha-num')?.textContent || '',
        scale: Math.round(scale * 1000) / 1000,
        ex: {
          left: cx - (ow * scale) / 2,
          right: cx + (ow * scale) / 2,
          top: cy - (oh * scale) / 2,
          bottom: cy + (oh * scale) / 2,
        },
        base: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      };
    }

    function gapBetween(a, b) {
      return Math.max(a.top - b.bottom, b.top - a.bottom, a.left - b.right, b.left - a.right, 0);
    }

    function overlaps(a, b) {
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }

    function edgeGaps(ex) {
      return {
        left: ex.left - zoneRect.left,
        right: zoneRect.right - ex.right,
        top: ex.top - zoneRect.top,
        bottom: zoneRect.bottom - ex.bottom,
      };
    }

    const chips = [...document.querySelectorAll('.milksha-ready .milksha-board-chip')];
    const all = chips.map(expandedForChip);
    const pulsing = all.filter((c) => c.scale >= SCALE_MIN);
    const staticChips = all.filter((c) => c.scale < SCALE_MIN);

    let minGapScaledPairPx = Infinity;
    const scaledPairGaps = [];
    for (let i = 0; i < pulsing.length; i += 1) {
      for (let j = i + 1; j < pulsing.length; j += 1) {
        const g = gapBetween(pulsing[i].ex, pulsing[j].ex);
        scaledPairGaps.push({
          a: pulsing[i].number,
          b: pulsing[j].number,
          gapPx: Math.round(g * 10) / 10,
        });
        minGapScaledPairPx = Math.min(minGapScaledPairPx, g);
      }
    }

    let minGapScaledToStaticPx = Infinity;
    const scaledToStatic = [];
    for (let i = 0; i < pulsing.length; i += 1) {
      for (let j = 0; j < staticChips.length; j += 1) {
        const g = gapBetween(pulsing[i].ex, staticChips[j].base);
        scaledToStatic.push({
          scaled: pulsing[i].number,
          other: staticChips[j].number,
          gapPx: Math.round(g * 10) / 10,
        });
        minGapScaledToStaticPx = Math.min(minGapScaledToStaticPx, g);
      }
    }

    let minGapToZoneEdgePx = Infinity;
    const zoneEdgeByChip = [];
    for (let i = 0; i < pulsing.length; i += 1) {
      const eg = edgeGaps(pulsing[i].ex);
      const minEdge = Math.min(eg.left, eg.right, eg.top, eg.bottom);
      zoneEdgeByChip.push({ number: pulsing[i].number, edges: eg, minEdgePx: Math.round(minEdge * 10) / 10 });
      minGapToZoneEdgePx = Math.min(minGapToZoneEdgePx, minEdge);
    }

    const overlapPairs = [];
    for (let i = 0; i < all.length; i += 1) {
      const boxI = all[i].scale >= SCALE_MIN ? all[i].ex : all[i].base;
      for (let j = i + 1; j < all.length; j += 1) {
        const boxJ = all[j].scale >= SCALE_MIN ? all[j].ex : all[j].base;
        if (overlaps(boxI, boxJ)) {
          overlapPairs.push({
            a: all[i].number,
            b: all[j].number,
            aScaled: all[i].scale >= SCALE_MIN,
            bScaled: all[j].scale >= SCALE_MIN,
          });
        }
      }
    }

    const roundInf = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

    return {
      ok: true,
      pulsingCount: pulsing.length,
      pulsingNumbers: pulsing.map((p) => ({ number: p.number, scale: p.scale })),
      minGapScaledPairPx: roundInf(minGapScaledPairPx),
      minGapScaledToStaticPx: roundInf(minGapScaledToStaticPx),
      minGapToZoneEdgePx: roundInf(minGapToZoneEdgePx),
      overlaps: overlapPairs.length > 0,
      overlapPairs,
      scaledPairGaps,
      zoneEdgeByChip,
    };
  });
}

async function runCase(browser, vp, scenarioKey, scenarioLabel) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/?mode=local`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload));
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
  });

  const minPulsing = scenarioKey === 'ten_at_once' ? 10 : scenarioKey === 'three_at_once' ? 3 : 2;
  await setupScenario(page, scenarioKey);
  await page.waitForFunction(() => document.querySelectorAll('.milksha-ready .milksha-board-chip').length === 10);
  await waitMultiPulseHold(page, minPulsing, 1.3);
  const metrics = await measureHold(page);
  await ctx.close();
  return {
    scenario: scenarioKey,
    label: scenarioLabel,
    viewport: vp.tag,
    expectedPulsing: minPulsing,
    ...metrics,
  };
}

async function main() {
  const { startSite } = await import('../tests/e2e/harness.mjs');
  await startSite();
  mkdirSync(ART, { recursive: true });

  const scenarios = [
    { key: 'three_at_once', label: '3 new ready in one batch (9990-9992)' },
    { key: 'ten_at_once', label: '10 new ready in one batch (9990-9999)' },
    { key: 'two_vertical_adjacent', label: '2 new ready (9990-9991) vertical adjacent cells' },
  ];

  const browser = await chromium.launch();
  const results = [];
  for (const vp of VIEWPORTS) {
    for (const sc of scenarios) {
      results.push(await runCase(browser, vp, sc.key, sc.label));
    }
  }
  await browser.close();

  const out = {
    generatedAt: new Date().toISOString(),
    boardHead: process.env.BOARD_HEAD || null,
    methodology:
      'Full grid 9990-9999; hold after readyScaleInMs; expanded chip box = offsetSize * matrix scale; gap = max of axis separations; overlap = AABB intersect.',
    results,
  };
  const jsonPath = join(ART, 'multi-pulse-gap-report.json');
  writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
