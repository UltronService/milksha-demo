#!/usr/bin/env node
/**
 * Bounding-box QA for mockups/source-icons.html (1920×1080).
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN_COLUMN_GAP_PX = 8;
const EDGE_TOL_PX = 1.5;
const ICON_NUM_MIN_GAP_PX = 14;

/** @typedef {{ ok: boolean, issues: string[], metrics: Record<string, unknown> }} Report */

async function runLayoutCheck() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const url = 'file://' + path.join(rootDir, 'mockups', 'source-icons.html');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(function () {
    return document.querySelector('[data-mockup-layout-ready="true"]') !== null;
  });
  await page.waitForFunction(function () {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i += 1) {
      if (!imgs[i].complete || imgs[i].naturalWidth === 0) {
        return false;
      }
    }
    return true;
  });

  /** @type {Report} */
  const report = await page.evaluate(function (limits) {
    const data = window.MilkshaSourceIconMockup;
    const issues = [];
    const metrics = {};

    /**
     * @param {DOMRect} rect
     * @param {{ left: number, right: number, top: number, bottom: number }} cream
     * @param {number} inset
     */
    function creamViolations(rect, cream, inset) {
      const list = [];
      if (rect.left < cream.left + inset - limits.edgeTol) {
        list.push('left<' + (cream.left + inset));
      }
      if (rect.right > cream.right - inset + limits.edgeTol) {
        list.push('right>' + (cream.right - inset));
      }
      if (rect.top < cream.top + limits.edgeTol) {
        list.push('top<' + cream.top);
      }
      if (rect.bottom > cream.bottom - limits.edgeTol) {
        list.push('bottom>' + cream.bottom);
      }
      return list;
    }

    ['prep', 'ready'].forEach(function (zone) {
      const layer = document.querySelector('.source-icons-mockup__layer[data-zone="' + zone + '"]');
      if (!layer) {
        issues.push(zone + ': missing layer');
        return;
      }

      const cream = data.creamRect(zone);
      const inset = data.CREAM_EDGE_INSET_PX;
      const cells = layer.querySelectorAll('.source-icons-mockup__cell');
      const rows = layer.querySelectorAll('.source-icons-mockup__row');
      const scales = [];
      rows.forEach(function (row) {
        const t = getComputedStyle(row).transform;
        if (t && t !== 'none') {
          const m = t.match(/matrix\(([^)]+)\)/);
          if (m) {
            const parts = m[1].split(',').map(function (v) {
              return Number.parseFloat(v.trim());
            });
            if (parts.length >= 1 && Number.isFinite(parts[0])) {
              scales.push(parts[0]);
            }
          }
        } else {
          scales.push(1);
        }
      });

      const zoneScale = getComputedStyle(layer).getPropertyValue('--mockup-zone-display-scale').trim();
      metrics[zone + 'ZoneScale'] = zoneScale;
      metrics[zone + 'RowScaleMin'] = scales.length ? Math.min.apply(null, scales) : null;
      metrics[zone + 'RowScaleMax'] = scales.length ? Math.max.apply(null, scales) : null;

      if (scales.length && Math.abs(scales[0] - scales[scales.length - 1]) > 0.001) {
        const uniq = scales.filter(function (s, i, a) {
          return a.indexOf(s) === i;
        });
        if (uniq.length > 1) {
          issues.push(zone + ': inconsistent row scale ' + uniq.join(','));
        }
      }

      /** @type {Record<number, Array<{ row: number, rect: DOMRect }>>} */
      const byCol = { 0: [], 1: [] };
      cells.forEach(function (cell) {
        const row = cell.querySelector('.source-icons-mockup__row');
        if (!row) {
          return;
        }
        const rect = row.getBoundingClientRect();
        const col = Number(cell.dataset.col);
        const rowIdx = Number(cell.dataset.row);
        const viol = creamViolations(rect, cream, inset);
        if (viol.length) {
          issues.push(zone + ' col' + col + ' row' + rowIdx + ' cream: ' + viol.join(','));
        }
        if (!byCol[col]) {
          byCol[col] = [];
        }
        byCol[col].push({ row: rowIdx, rect: rect });

        const icon = row.querySelector('.source-icons-mockup__icon');
        const num = row.querySelector('.source-icons-mockup__num');
        if (icon && num) {
          const ir = icon.getBoundingClientRect();
          const nr = num.getBoundingClientRect();
          const gap = nr.left - ir.right;
          if (gap < limits.iconGapMin - 0.5) {
            issues.push(
              zone + ' col' + col + ' row' + rowIdx + ' icon-num gap=' + gap.toFixed(1),
            );
          }
        }
      });

      for (let r = 0; r < 5; r += 1) {
        const left = byCol[0].find(function (x) {
          return x.row === r;
        });
        const right = byCol[1].find(function (x) {
          return x.row === r;
        });
        if (!left || !right) {
          continue;
        }
        const gap = right.rect.left - left.rect.right;
        metrics[zone + 'Row' + r + 'ColGap'] = gap;
        if (gap < limits.colGapMin) {
          issues.push(zone + ' row' + r + ' column overlap gap=' + gap.toFixed(1));
        }
      }
    });

    return { ok: issues.length === 0, issues: issues, metrics: metrics };
  }, {
    edgeTol: EDGE_TOL_PX,
    colGapMin: MIN_COLUMN_GAP_PX,
    iconGapMin: ICON_NUM_MIN_GAP_PX,
  });

  await browser.close();
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
