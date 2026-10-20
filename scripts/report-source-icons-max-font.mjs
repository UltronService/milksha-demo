#!/usr/bin/env node
/**
 * Max uniform font (UI/UX slot 1F + gap 0.2F) at 1920×1080.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer, serverPort } from './source-icons-static-server.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_FONT_PX = 81;
const SAFE_INSET = 0.985;

async function computeMetrics(page) {
  return page.evaluate(function (params) {
    const LIVE = params.liveFontPx;
    const SAFE = params.safeInset;
    const CREAM = {
      prep: { left: 101, right: 899 },
      ready: { left: 1020, right: 1819 },
    };
    const INSET = 12;
    const MID_GAP = 10;

    function columnWidths(zone) {
      const c = CREAM[zone];
      const midX = (c.left + c.right) / 2;
      const w0 = midX - MID_GAP / 2 - (c.left + INSET);
      const w1 = c.right - INSET - (midX + MID_GAP / 2);
      return [w0 * SAFE, w1 * SAFE];
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('no 2d');
    }

    function rowWidth(fontPx, text) {
      const slotW = fontPx * 1;
      const gap = fontPx * 0.2;
      ctx.font = '400 ' + fontPx + 'px Arial, Arimo, sans-serif';
      return slotW + gap + ctx.measureText(text).width;
    }

    const mock = window.MilkshaSourceIconMockup;
    const PREP = mock.PREP_SAMPLES;
    const READY = mock.READY_SAMPLES;
    const W5 = mock.WORST_ICON_PLUS_FIVE || 'BFBEF';
    const HASH6 = mock.FP_WORST_HASH_SIX || '#999999';

    function fpDisplay(digits) {
      return mock.formatFoodpandaMockDisplay(digits);
    }

    function displayForRow(row) {
      if (row.source === 'fp') {
        return fpDisplay(row.number);
      }
      return row.number;
    }

    function zoneFits(samples, zone, fontPx, displayFn) {
      const cols = columnWidths(zone);
      for (let i = 0; i < samples.length; i += 1) {
        const col = i < 5 ? 0 : 1;
        const text = displayFn(samples[i]);
        const w = rowWidth(fontPx, text);
        if (w > cols[col] + 0.05) {
          return { ok: false, index: i, text: text, width: w, maxW: cols[col] };
        }
      }
      return { ok: true };
    }

    function maxFontBothZones(displayFn, hiPx) {
      let lo = 24;
      let hi = hiPx;
      let best = lo;
      let binding = null;
      while (hi - lo > 0.05) {
        const mid = (lo + hi) / 2;
        const p = zoneFits(PREP, 'prep', mid, displayFn);
        const r = zoneFits(READY, 'ready', mid, displayFn);
        if (p.ok && r.ok) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
          binding = !p.ok ? { zone: 'prep', ...p } : { zone: 'ready', ...r };
        }
      }
      return { fontPx: best, bindingAtMax: binding };
    }

    function syntheticWorst(textForNonStore) {
      return function (row) {
        if (row.source === 'store') {
          return row.number;
        }
        return textForNonStore;
      };
    }

    const actualDisplay = function (row) {
      return displayForRow(row);
    };

    const jointActual = maxFontBothZones(actualDisplay, 120);
    const jointIconPlus5 = maxFontBothZones(syntheticWorst(W5), 120);
    const jointIconPlusHash6 = maxFontBothZones(syntheticWorst(HASH6), 120);

    const at81Actual = {
      prep: zoneFits(PREP, 'prep', LIVE, actualDisplay),
      ready: zoneFits(READY, 'ready', LIVE, actualDisplay),
    };

    return {
      viewport: '1920x1080',
      layout: 'UI/UX slot 1.0F + gap 0.2F + number; store empty slot; icons not in width math',
      liveProductionFontPx: LIVE,
      atLive81px: at81Actual,
      maxUniformFontPx_bothZonesSame: {
        actualLogShapedSamples: jointActual,
        worstCase_iconPlus5Chars: jointIconPlus5,
        worstCase_iconPlusHash999999: jointIconPlusHash6,
      },
      deltaFromLive81px: {
        actualSamples: LIVE - jointActual.fontPx,
        iconPlus5: LIVE - jointIconPlus5.fontPx,
        iconPlusHash6: LIVE - jointIconPlusHash6.fontPx,
      },
      previewBRecommendation: {
        useFontPx: jointIconPlus5.fontPx,
        skipSeparateBIfGte81: jointIconPlus5.fontPx >= LIVE - 0.01,
      },
    };
  }, { liveFontPx: LIVE_FONT_PX, safeInset: SAFE_INSET });
}

async function main() {
  const server = await startStaticServer(rootDir, 0);
  const port = serverPort(server);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://127.0.0.1:' + port + '/mockups/source-icons-font-preview.html?fontPx=81', {
    waitUntil: 'domcontentloaded',
  });
  const report = await computeMetrics(page);
  await browser.close();
  await new Promise(function (resolve) {
    server.close(function () {
      resolve(undefined);
    });
  });
  const outDir = path.join(rootDir, 'mockups', 'artifacts', 'source-icons-mockup');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'max-uniform-font-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
