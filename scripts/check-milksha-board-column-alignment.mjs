#!/usr/bin/env node
/**
 * PR #74 column alignment: fixed 1.0F slot + 0.2F gap + number; left edges align per column.
 */
import { chromium } from 'playwright';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOL_PX = 1;

/** Four sources, varying number widths (5-char Uber, hash fp, point, store). */
export const ALIGNMENT_SAMPLE_PAYLOAD = [
  { source_type: 'From_UberEat_Preparing', number: 'A2C9E' },
  { source_type: 'From_FoodPanda_Preparing', number: '#6406' },
  { source_type: 'From_milksha_point_Preparing', number: '0097' },
  { source_type: 'From_Store_Preparing', number: '2218' },
  { source_type: 'From_UberEat_Preparing', number: 'BFBEF' },
  { source_type: 'From_FoodPanda_Preparing', number: '#6405' },
  { source_type: 'From_milksha_point_Preparing', number: '0096' },
  { source_type: 'From_Store_Preparing', number: '2217' },
  { source_type: 'From_UberEat_Preparing', number: 'C3D4E' },
  { source_type: 'From_FoodPanda_Preparing', number: '#1234' },
];

function prepareSite() {
  const siteRoot = join('/tmp', 'milksha-column-align-' + process.pid);
  const dest = join(siteRoot, 'milksha-demo');
  rmSync(siteRoot, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(rootDir, dest, { recursive: true, filter: (src) => !src.includes('node_modules') });
  const port = ephemeralPort();
  return { siteRoot, base: `http://127.0.0.1:${port}/milksha-demo/`, port: port };
}

function startServer(siteRoot, port) {
  return new Promise((resolve) => {
    const listenPort = port || 8774;
    const server = createServer((req, res) => {
      try {
        let urlPath = req.url?.split('?')[0] || '/';
        if (urlPath.endsWith('/')) {
          urlPath += 'index.html';
        }
        const filePath = join(siteRoot, decodeURIComponent(urlPath));
        const data = readFileSync(filePath);
        const ext = filePath.split('.').pop() || '';
        const types = { html: 'text/html', css: 'text/css', js: 'text/javascript', png: 'image/png', jpg: 'image/jpeg' };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        res.end(data);
      } catch (_err) {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(listenPort, '127.0.0.1', () => resolve(server));
  });
}

let portSeq = 0;
function ephemeralPort() {
  portSeq += 1;
  return 8800 + ((process.pid + portSeq) % 200);
}

/**
 * @returns {Promise<{ ok: boolean, tolPx: number, zones: object, failures: string[] }>}
 */
export async function runColumnAlignmentCheck(options) {
  const opts = options || {};
  const payload = opts.payload || ALIGNMENT_SAMPLE_PAYLOAD;
  const { siteRoot, base, port } = prepareSite();
  const server = await startServer(siteRoot, port);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(base + '?demo=0', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.QMS && window.QMS.runtime && window.QMS.runtime.applyPayload);
  await page.evaluate((rows) => {
    const off = document.getElementById('milksha-cloud-offline');
    if (off) {
      off.hidden = true;
    }
    window.QMS.runtime.applyPayload(rows, { silent: true });
  }, payload);
  await page.waitForSelector('.milksha-prep .milksha-board-chip');
  await page.waitForFunction(() => {
    const imgs = document.querySelectorAll('.milksha-board-icon');
    for (const img of imgs) {
      if (!img.complete || img.naturalWidth === 0) {
        return false;
      }
    }
    return imgs.length >= 4;
  });

  const result = await page.evaluate(function (tol) {
    const canvas = document.getElementById('milksha-board-canvas');
    const cRect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const m = canvas && canvas.style.transform ? canvas.style.transform.match(/scale\(([^)]+)\)/) : null;
    const scale = m ? Number(m[1]) : 1;

    function boardLeft(el) {
      const r = el.getBoundingClientRect();
      return (r.left - cRect.left) / scale;
    }

    function measureZone(selector, zoneKey) {
      const cells = Array.from(document.querySelectorAll(selector + ' .milksha-num-cell'));
      const columns = [[], []];
      for (let i = 0; i < cells.length; i += 1) {
        const chip = cells[i].querySelector('.milksha-board-chip');
        const num = cells[i].querySelector('.milksha-num');
        if (!chip || !num || !num.textContent) {
          continue;
        }
        const col = i < 5 ? 0 : 1;
        const iconBox = chip.querySelector('.milksha-board-icon-box');
        const row = {
          index: i,
          number: num.textContent.trim(),
          numLeft: boardLeft(num),
          iconBoxLeft: iconBox ? boardLeft(iconBox) : null,
          slotLeft: boardLeft(chip.querySelector('.milksha-board-icon-slot') || chip),
        };
        columns[col].push(row);
      }
      const colStats = columns.map(function (rows, colIdx) {
        const numLefts = rows.map((r) => r.numLeft);
        const boxLefts = rows.filter((r) => r.iconBoxLeft != null).map((r) => r.iconBoxLeft);
        const numSpread = numLefts.length ? Math.max(...numLefts) - Math.min(...numLefts) : 0;
        const boxSpread = boxLefts.length ? Math.max(...boxLefts) - Math.min(...boxLefts) : 0;
        return {
          col: colIdx,
          rows: rows,
          numLeftMin: numLefts.length ? Math.min(...numLefts) : null,
          numLeftMax: numLefts.length ? Math.max(...numLefts) : null,
          numSpread: numSpread,
          iconBoxLeftMin: boxLefts.length ? Math.min(...boxLefts) : null,
          iconBoxLeftMax: boxLefts.length ? Math.max(...boxLefts) : null,
          iconBoxSpread: boxSpread,
        };
      });
      return { zoneKey: zoneKey, columns: colStats };
    }

    const prep = measureZone('.milksha-prep', 'prep');
    const ready = measureZone('.milksha-ready', 'ready');
    const failures = [];
    for (const zone of [prep, ready]) {
      for (const col of zone.columns) {
        if (col.rows.length === 0) {
          continue;
        }
        if (col.numSpread > tol) {
          failures.push(
            zone.zoneKey +
              ' col' +
              col.col +
              ' number left spread ' +
              col.numSpread.toFixed(2) +
              'px > ' +
              tol,
          );
        }
        if (col.iconBoxSpread > tol) {
          failures.push(
            zone.zoneKey +
              ' col' +
              col.col +
              ' icon-box left spread ' +
              col.iconBoxSpread.toFixed(2) +
              'px > ' +
              tol,
          );
        }
      }
    }
    return { ok: failures.length === 0, tolPx: tol, zones: { prep: prep, ready: ready }, failures: failures };
  }, TOL_PX);

  await browser.close();
  await new Promise(function (r) {
    server.close(function () {
      r(undefined);
    });
  });
  return result;
}

export async function captureFullBoardScreenshot(options) {
  const opts = options || {};
  const outPath = opts.outPath || join(rootDir, 'artifacts', 'milksha-official-board', 'milksha-official-board-1920x1080.png');
  const payload = opts.payload;
  const { siteRoot, base, port } = prepareSite();
  const server = await startServer(siteRoot, port);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(base + '?demo=0', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.QMS && window.QMS.runtime && window.QMS.runtime.applyPayload);
  await page.evaluate((rows) => {
    const off = document.getElementById('milksha-cloud-offline');
    const paused = document.getElementById('milksha-cloud-paused');
    if (off) {
      off.hidden = true;
    }
    if (paused) {
      paused.hidden = true;
    }
    window.QMS.runtime.applyPayload(rows, { silent: true });
  }, payload);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.milksha-prep .milksha-num').length >= 10 &&
      document.querySelectorAll('.milksha-ready .milksha-num').length >= 10,
    undefined,
    { timeout: 60000 },
  );
  await page.waitForFunction(() => {
    for (const img of document.querySelectorAll('.milksha-board-icon')) {
      if (!img.complete || img.naturalWidth === 0) {
        return false;
      }
    }
    return true;
  });
  await page.waitForTimeout(400);
  mkdirSync(dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, fullPage: false });
  const alignment = await page.evaluate(function (tol) {
    const canvas = document.getElementById('milksha-board-canvas');
    const cRect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const m = canvas && canvas.style.transform ? canvas.style.transform.match(/scale\(([^)]+)\)/) : null;
    const scale = m ? Number(m[1]) : 1;
    function boardLeft(el) {
      return (el.getBoundingClientRect().left - cRect.left) / scale;
    }
    function zoneRows(sel) {
      const cells = Array.from(document.querySelectorAll(sel + ' .milksha-num-cell'));
      return cells
        .map(function (cell, i) {
          const num = cell.querySelector('.milksha-num');
          const box = cell.querySelector('.milksha-board-icon-box');
          if (!num || !num.textContent) {
            return null;
          }
          return {
            index: i,
            number: num.textContent.trim(),
            numLeft: Math.round(boardLeft(num) * 10) / 10,
            iconBoxLeft: box ? Math.round(boardLeft(box) * 10) / 10 : null,
          };
        })
        .filter(Boolean);
    }
    return { prep: zoneRows('.milksha-prep'), ready: zoneRows('.milksha-ready'), tolPx: tol };
  }, TOL_PX);
  await browser.close();
  await new Promise(function (r) {
    server.close(function () {
      r(undefined);
    });
  });
  return { outPath: outPath, alignment: alignment };
}

/** 10 prep + 10 ready, mixed sources, distinct ids per zone. */
export function buildFullBoardMixedPayload() {
  const prepNos = [
    { sourceKey: 'uber', no: 'A2C9E' },
    { sourceKey: 'fp', no: '#6406' },
    { sourceKey: 'point', no: '0097' },
    { sourceKey: 'store', no: '2218' },
    { sourceKey: 'uber', no: 'BFBEF' },
    { sourceKey: 'fp', no: '#6405' },
    { sourceKey: 'point', no: '0096' },
    { sourceKey: 'store', no: '2217' },
    { sourceKey: 'uber', no: 'C3D4E' },
    { sourceKey: 'fp', no: '#1234' },
  ];
  const readyNos = [
    { sourceKey: 'store', no: '8801' },
    { sourceKey: 'point', no: '8802' },
    { sourceKey: 'fp', no: '#8803' },
    { sourceKey: 'uber', no: 'D4E5F' },
    { sourceKey: 'store', no: '8804' },
    { sourceKey: 'point', no: '8805' },
    { sourceKey: 'fp', no: '#8806' },
    { sourceKey: 'uber', no: 'E5F6A' },
    { sourceKey: 'store', no: '8807' },
    { sourceKey: 'point', no: '8808' },
  ];
  const prefix = {
    store: 'From_Store_',
    point: 'From_milksha_point_',
    fp: 'From_FoodPanda_',
    uber: 'From_UberEat_',
  };
  const prep = prepNos.map(function (r) {
    return { source_type: prefix[r.sourceKey] + 'Preparing', number: r.no };
  });
  const ready = readyNos.map(function (r) {
    return { source_type: prefix[r.sourceKey] + 'OK', number: r.no };
  });
  return prep.concat(ready);
}
