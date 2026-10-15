#!/usr/bin/env node
/**
 * Max uniform font px at 1920×1080 (no chip-scale), owner scenarios.
 * Does not modify mockup visuals — report only.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer, serverPort } from './source-icons-static-server.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_FONT_PX = 81;
const READY_RATIO = 1.3;
const SAFE_INSET = 0.985;

/** @typedef {{ prepFont: number, readyFont: number, bindingLabel: string | null }} FitResult */

/**
 * @param {import('playwright').Page} page
 */
async function computeMetrics(page) {
  return page.evaluate(
    function (params) {
      const LIVE = params.liveFontPx;
      const RATIO = params.readyRatio;
      const SAFE = params.safeInset;

      const CREAM = {
        prep: { left: 101, right: 899 },
        ready: { left: 1020, right: 1819 },
      };
      const INSET = 12;
      const MID_GAP = 10;

      /**
       * @param {'prep' | 'ready'} zone
       */
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

      /**
       * @param {number} fontPx
       * @param {string} text
       */
      function textWidth(fontPx, text) {
        ctx.font = '400 ' + fontPx + 'px Arial, Arimo, sans-serif';
        return ctx.measureText(text).width;
      }

      /**
       * Icon row layout mirrors mockups/source-icons-overlay.css at --milksha-num-font.
       * @param {number} fontPx
       * @param {string} text
       */
      function iconRowWidth(fontPx, text) {
        const iconH = (fontPx * 58) / 81;
        const slotW = iconH * 1.32;
        const gap = (6 * fontPx) / 81;
        return slotW + gap + textWidth(fontPx, text);
      }

      /**
       * @param {number} fontPx
       */
      function storeRowWidth(fontPx, text) {
        return textWidth(fontPx, text);
      }

      const PREP = [
        { source: 'store', number: '1985' },
        { source: 'uber', number: 'A7K2Q9' },
        { source: 'point', number: '087' },
        { source: 'fp', number: '640609' },
        { source: 'store', number: '3105' },
        { source: 'point', number: '0412' },
        { source: 'uber', number: 'C7458' },
        { source: 'fp', number: '583920' },
        { source: 'store', number: '1861' },
        { source: 'point', number: '0096' },
      ];
      const READY = [
        { source: 'fp', number: '902114' },
        { source: 'store', number: '2216' },
        { source: 'uber', number: 'K5T7W2' },
        { source: 'point', number: '095' },
        { source: 'store', number: '2217' },
        { source: 'fp', number: '660138' },
        { source: 'uber', number: 'B3R8M9' },
        { source: 'point', number: '0041' },
        { source: 'store', number: '2218' },
        { source: 'fp', number: '481725' },
      ];

      /**
       * @param {string} digits
       */
      function fpHash(digits) {
        return '#' + String(digits).replace(/^#+/, '').slice(0, 6);
      }

      /**
       * @param {typeof PREP} samples
       * @param {'prep' | 'ready'} zone
       * @param {number} fontPx
       * @param {(row: { source: string, number: string }) => string} displayText
       */
      function zoneFits(samples, zone, fontPx, displayText) {
        const cols = columnWidths(zone);
        for (let i = 0; i < samples.length; i += 1) {
          const row = samples[i];
          const col = i < 5 ? 0 : 1;
          const maxW = cols[col];
          const text = displayText(row);
          const w =
            row.source === 'store' ? storeRowWidth(fontPx, text) : iconRowWidth(fontPx, text);
          if (w > maxW + 0.05) {
            return { ok: false, index: i, source: row.source, text: text, width: w, maxW: maxW };
          }
        }
        return { ok: true };
      }

      /**
       * @param {typeof PREP} samples
       * @param {'prep' | 'ready'} zone
       * @param {(row: { source: string, number: string }) => string} displayText
       * @param {number} hiPx
       */
      function maxFontForZone(samples, zone, displayText, hiPx) {
        let lo = 24;
        let hi = hiPx;
        let best = lo;
        let binding = null;
        while (hi - lo > 0.05) {
          const mid = (lo + hi) / 2;
          const fit = zoneFits(samples, zone, mid, displayText);
          if (fit.ok) {
            best = mid;
            lo = mid;
          } else {
            hi = mid;
            binding = fit;
          }
        }
        return { fontPx: best, bindingAtMax: binding };
      }

      /**
       * @param {(row: { source: string, number: string }) => string} prepDisplay
       * @param {(row: { source: string, number: string }) => string} readyDisplay
       */
      function maxJointPrepFont(prepDisplay, readyDisplay) {
        let lo = 24;
        let hi = 96;
        let best = lo;
        let binding = null;
        while (hi - lo > 0.05) {
          const mid = (lo + hi) / 2;
          const prepFit = zoneFits(PREP, 'prep', mid, prepDisplay);
          const readyFit = zoneFits(READY, 'ready', mid * RATIO, readyDisplay);
          if (prepFit.ok && readyFit.ok) {
            best = mid;
            lo = mid;
          } else {
            hi = mid;
            binding = !prepFit.ok ? { zone: 'prep', ...prepFit } : { zone: 'ready', ...readyFit };
          }
        }
        return {
          prepFontPx: best,
          readyFontPx: best * RATIO,
          bindingAtMax: binding,
        };
      }

      /** Synthetic: every non-store row uses same worst label */
      function syntheticWorstSamples(worstIconText) {
        return function (row) {
          if (row.source === 'store') {
            return row.number;
          }
          return worstIconText;
        };
      }

      const displayActualPrep = function (row) {
        if (row.source === 'fp') {
          return fpHash(row.number);
        }
        return row.number;
      };
      const displayActualReady = displayActualPrep;

      const actualPrepOnly = maxFontForZone(PREP, 'prep', displayActualPrep, 110);
      const actualReadyOnly = maxFontForZone(READY, 'ready', displayActualReady, 110);
      const jointActual = maxJointPrepFont(displayActualPrep, displayActualReady);

      const jointWorstHash = maxJointPrepFont(
        syntheticWorstSamples('#999999'),
        syntheticWorstSamples('#999999'),
      );
      const jointWorstNoHash = maxJointPrepFont(
        syntheticWorstSamples('999999'),
        syntheticWorstSamples('999999'),
      );

      const atLivePrep = zoneFits(PREP, 'prep', LIVE, displayActualPrep);
      const atLiveReady = zoneFits(READY, 'ready', LIVE, displayActualReady);
      const atLiveReady13 = zoneFits(READY, 'ready', LIVE * RATIO, displayActualReady);

      /** Find widest icon row label at LIVE px among candidates */
      const candidates = ['#999999', '999999', 'A7K2Q9', 'K5T7W2', 'WMWMWM', '666666'];
      let widest = { text: '', width: 0 };
      for (const t of candidates) {
        const w = iconRowWidth(LIVE, t);
        if (w > widest.width) {
          widest = { text: t, width: w };
        }
      }

      return {
        viewport: '1920x1080',
        assumptions: {
          uniformFontPerZone: true,
          noChipScale: true,
          fontFamily: 'Arial 400',
          iconMetricsFrom: 'mockups/source-icons-overlay.css (58/81 cap height, slot 1.32×, gap 6/81)',
          columnWidthsPx: {
            prep: columnWidths('prep'),
            ready: columnWidths('ready'),
          },
          readyToPrepTargetRatio: RATIO,
          liveProductionFontPx: LIVE,
        },
        atLiveProduction81px: {
          prepAllSamplesFit: atLivePrep.ok,
          prepFirstFailure: atLivePrep.ok ? null : atLivePrep,
          readyAllSamplesFitAt81: atLiveReady.ok,
          readyFirstFailureAt81: atLiveReady.ok ? null : atLiveReady,
          readyAllSamplesFitAt81x1_3: atLiveReady13.ok,
          readyFirstFailureAt106_3: atLiveReady13.ok ? null : atLiveReady13,
          widestIconRowAt81px: widest,
        },
        maxUniformFontPx: {
          prepOnly_actualSamples: actualPrepOnly,
          readyOnly_actualSamples: actualReadyOnly,
          joint_actualSamples_readyEqPrepTimes1_3: jointActual,
          joint_worstCase_iconPlusHash999999: jointWorstHash,
          joint_worstCase_iconPlus999999_noHash: jointWorstNoHash,
        },
        deltaFromLive81px: {
          prepOnly_actualSamples: {
            maxPx: actualPrepOnly.fontPx,
            deltaPx: LIVE - actualPrepOnly.fontPx,
          },
          readyOnly_actualSamples: {
            maxPx: actualReadyOnly.fontPx,
            deltaPx: LIVE - actualReadyOnly.fontPx,
          },
          joint_actualSamples: {
            prepMaxPx: jointActual.prepFontPx,
            readyMaxPx: jointActual.readyFontPx,
            prepDeltaFrom81: LIVE - jointActual.prepFontPx,
            readyDeltaFrom81: LIVE - jointActual.readyFontPx,
            readyDeltaFrom81x1_3Target: LIVE * RATIO - jointActual.readyFontPx,
          },
          joint_worstHash: {
            prepMaxPx: jointWorstHash.prepFontPx,
            readyMaxPx: jointWorstHash.readyFontPx,
            prepDeltaFrom81: LIVE - jointWorstHash.prepFontPx,
            readyDeltaFrom81: LIVE - jointWorstHash.readyFontPx,
          },
          joint_worstNoHash: {
            prepMaxPx: jointWorstNoHash.prepFontPx,
            readyMaxPx: jointWorstNoHash.readyFontPx,
            prepDeltaFrom81: LIVE - jointWorstNoHash.prepFontPx,
            readyDeltaFrom81: LIVE - jointWorstNoHash.readyFontPx,
          },
        },
        currentMockupNote:
          'Existing mock uses chip-scale ~0.77 while CSS font stays 81px, so icon rows look smaller than store — not uniform visual size.',
      };
    },
    { liveFontPx: LIVE_FONT_PX, readyRatio: READY_RATIO, safeInset: SAFE_INSET },
  );
}

async function main() {
  const server = await startStaticServer(rootDir, 0);
  const port = serverPort(server);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://127.0.0.1:' + port + '/mockups/source-icons.html?baseline=1', {
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
