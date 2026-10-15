#!/usr/bin/env node
/**
 * Pixel-cream + live-board chip bbox QA for mockups/source-icons.html (1920×1080).
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startStaticServer, serverPort } from './source-icons-static-server.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCKUP_PORT = Number(process.env.SOURCE_ICONS_MOCKUP_PORT || 0);
const BG_PATH = path.join(rootDir, 'assets', 'milksha-board-bg-1007.jpg');
const CREAM_EDGE_INSET_PX = 12;
const MIN_COLUMN_GAP_PX = 8;
const MIN_ICON_NUM_GAP_PX = 4;
const LIVE_FONT_TOL_PX = 1.5;
const BBOX_TOL_PX = 1;

/** @typedef {{ ok: boolean, issues: string[], metrics: Record<string, unknown> }} Report */

/**
 * @param {{ skipServer?: boolean, port?: number }} [options]
 */
export async function runLayoutCheck(options) {
  const opts = options || {};
  let server = null;
  if (!opts.skipServer) {
    server = await startStaticServer(rootDir, opts.port ?? MOCKUP_PORT);
  }
  const port = opts.port || (server ? serverPort(server) : MOCKUP_PORT);
  const bgB64 = readFileSync(BG_PATH).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const url = 'http://127.0.0.1:' + port + '/mockups/source-icons.html';
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(function () {
    const rootEl = document.getElementById('board-root');
    return rootEl && rootEl.dataset.mockupLayoutReady === 'true';
  });
  await page.waitForFunction(function () {
    var imgs = document.querySelectorAll('.source-icons-live__icon');
    for (var i = 0; i < imgs.length; i += 1) {
      if (!imgs[i].complete || imgs[i].naturalWidth === 0) {
        return false;
      }
    }
    return true;
  });

  /** @type {Report} */
  const report = await page.evaluate(
    async function (args) {
      const limits = args.limits;
      const issues = [];
      const metrics = {};

      function isInnerCream(r, g, b) {
        return r >= 253 && g >= 249 && b >= 193 && b <= 222;
      }

      const img = await new Promise(function (resolve, reject) {
        const el = new Image();
        el.onload = function () {
          resolve(el);
        };
        el.onerror = reject;
        el.src = 'data:image/jpeg;base64,' + args.bgB64;
      });
      const w = img.width;
      const h = img.height;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { ok: false, issues: ['canvas 2d missing'], metrics: {} };
      }
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, w, h);

      function creamBBoxFromPixels(x0, x1) {
        let minX = w;
        let minY = h;
        let maxX = 0;
        let maxY = 0;
        let count = 0;
        for (let y = 320; y < h; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const i = (y * w + x) * 4;
            if (isInnerCream(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2])) {
              count += 1;
              if (x < minX) {
                minX = x;
              }
              if (y < minY) {
                minY = y;
              }
              if (x > maxX) {
                maxX = x;
              }
              if (y > maxY) {
                maxY = y;
              }
            }
          }
        }
        if (count < 1000) {
          return null;
        }
        return { left: minX, top: minY, right: maxX, bottom: maxY };
      }

      const creamPrep = creamBBoxFromPixels(0, Math.floor(w / 2));
      const creamReady = creamBBoxFromPixels(Math.floor(w / 2), w);
      metrics.creamPrepPixel = creamPrep;
      metrics.creamReadyPixel = creamReady;
      metrics.backgroundAssetPath = 'assets/milksha-board-bg-1007.jpg';

      if (!creamPrep || !creamReady) {
        issues.push('pixel cream detect failed');
        return { ok: false, issues: issues, metrics: metrics };
      }

      function assertInsideCream(rect, cream, label) {
        const inset = limits.creamInset;
        const inner = {
          left: cream.left + inset,
          right: cream.right - inset,
          top: cream.top + inset,
          bottom: cream.bottom - inset,
        };
        if (rect.left < inner.left - limits.bboxTol) {
          issues.push(label + ' left ' + rect.left.toFixed(1) + '<' + inner.left);
        }
        if (rect.right > inner.right + limits.bboxTol) {
          issues.push(label + ' right ' + rect.right.toFixed(1) + '>' + inner.right);
        }
        if (rect.top < inner.top - limits.bboxTol) {
          issues.push(label + ' top ' + rect.top.toFixed(1) + '<' + inner.top);
        }
        if (rect.bottom > inner.bottom + limits.bboxTol) {
          issues.push(label + ' bottom ' + rect.bottom.toFixed(1) + '>' + inner.bottom);
        }
      }

      function rectsOverlap(a, b) {
        return !(
          a.right <= b.left + limits.bboxTol ||
          b.right <= a.left + limits.bboxTol ||
          a.bottom <= b.top + limits.bboxTol ||
          b.bottom <= a.top + limits.bboxTol
        );
      }

      const art =
        window.QMS && window.QMS.Board && window.QMS.Board.LandscapeArtLayout
          ? window.QMS.Board.LandscapeArtLayout
          : null;
      const rowCy = art && art.ROW_CY ? art.ROW_CY : [438, 549, 659, 770, 880];

      /**
       * @param {number} cy
       * @returns {number}
       */
      function nearestRow(cy) {
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < rowCy.length; i += 1) {
          const d = Math.abs(cy - rowCy[i]);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        return best;
      }

      ['prep', 'ready'].forEach(function (zoneKey) {
        const cream = zoneKey === 'ready' ? creamReady : creamPrep;
        const zone = document.querySelector('.milksha-zone.' + zoneKey);
        if (!zone) {
          issues.push(zoneKey + ': missing zone');
          return;
        }
        const midX = (cream.left + cream.right) / 2;
        const cells = zone.querySelectorAll('.milksha-num-cell');
        /** @type {Record<number, { left: DOMRect | null, right: DOMRect | null }>} */
        const byRow = {};

        cells.forEach(function (cell) {
          const chip = cell.querySelector('.milksha-board-chip');
          if (!chip) {
            return;
          }
          const cellRect = cell.getBoundingClientRect();
          const col = cellRect.left + cellRect.width / 2 < midX ? 0 : 1;
          const row = nearestRow(cellRect.top + cellRect.height / 2);

          const icon = chip.querySelector('.source-icons-live__icon');
          const num = chip.querySelector('.milksha-num');
          const chipRect = chip.getBoundingClientRect();

          assertInsideCream(chipRect, cream, zoneKey + ' c' + col + ' r' + row + ' chip');
          if (icon) {
            assertInsideCream(icon.getBoundingClientRect(), cream, zoneKey + ' c' + col + ' r' + row + ' icon');
          }
          if (num) {
            assertInsideCream(num.getBoundingClientRect(), cream, zoneKey + ' c' + col + ' r' + row + ' num');
          }

          if (icon && num) {
            const slot = chip.querySelector('.source-icons-live__icon-slot');
            const slotRight = slot
              ? slot.getBoundingClientRect().right
              : icon.getBoundingClientRect().right;
            const gap = num.getBoundingClientRect().left - slotRight;
            if (gap < limits.iconGapMin - 0.5) {
              issues.push(zoneKey + ' c' + col + ' r' + row + ' slot-num gap=' + gap.toFixed(2));
            }
          }

          if (!byRow[row]) {
            byRow[row] = { left: null, right: null };
          }
          if (col === 0) {
            byRow[row].left = chipRect;
          } else {
            byRow[row].right = chipRect;
          }
        });

        for (let r = 0; r < 5; r += 1) {
          const pair = byRow[r];
          if (!pair || !pair.left || !pair.right) {
            continue;
          }
          const gap = pair.right.left - pair.left.right;
          metrics[zoneKey + 'Row' + r + 'ColGap'] = gap;
          if (gap < limits.colGapMin) {
            issues.push(zoneKey + ' row' + r + ' columns overlap gap=' + gap.toFixed(1));
          }
          if (rectsOverlap(pair.left, pair.right)) {
            issues.push(zoneKey + ' row' + r + ' chip boxes intersect');
          }
        }
      });

      const prepNum = document.querySelector('.milksha-zone.prep .milksha-num');
      const readyNum = document.querySelector('.milksha-zone.ready .milksha-num');
      const prepFont = prepNum ? Number.parseFloat(getComputedStyle(prepNum).fontSize) : 0;
      const readyFont = readyNum ? Number.parseFloat(getComputedStyle(readyNum).fontSize) : 0;
      const liveArtFont = art && art.NUM_FONT_PX ? art.NUM_FONT_PX : 81;
      metrics.liveBoardNumFontPx = liveArtFont;
      metrics.prepComputedFontPx = prepFont;
      metrics.readyComputedFontPx = readyFont;
      metrics.readyToPrepFontRatio = prepFont > 0 ? readyFont / prepFont : 0;

      if (Math.abs(prepFont - liveArtFont) > limits.liveFontTol) {
        issues.push('prep font ' + prepFont + ' != live ' + liveArtFont);
      }
      if (Math.abs(readyFont - liveArtFont) > limits.liveFontTol) {
        issues.push('ready font ' + readyFont + ' != live ' + liveArtFont);
      }

      const boardRoot = document.getElementById('board-root');
      if (boardRoot) {
        metrics.prepChipScale = boardRoot.dataset.prepChipScale;
        metrics.readyChipScale = boardRoot.dataset.readyChipScale;
      }

      return { ok: issues.length === 0, issues: issues, metrics: metrics };
    },
    {
      bgB64: bgB64,
      limits: {
        creamInset: CREAM_EDGE_INSET_PX,
        colGapMin: MIN_COLUMN_GAP_PX,
        iconGapMin: MIN_ICON_NUM_GAP_PX,
        liveFontTol: LIVE_FONT_TOL_PX,
        bboxTol: BBOX_TOL_PX,
      },
    },
  );

  await browser.close();
  if (server) {
    await new Promise(function (resolve) {
      server.close(function () {
        resolve(undefined);
      });
    });
  }
  return report;
}

async function main() {
  const report = await runLayoutCheck();
  const outPath = path.join(
    rootDir,
    'mockups',
    'artifacts',
    'source-icons-mockup',
    'layout-check.json',
  );
  await import('node:fs/promises').then(function (fs) {
    return fs.mkdir(path.dirname(outPath), { recursive: true }).then(function () {
      return fs.writeFile(outPath, JSON.stringify(report, null, 2));
    });
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exit(1);
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
