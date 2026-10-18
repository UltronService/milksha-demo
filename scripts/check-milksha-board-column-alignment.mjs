#!/usr/bin/env node
/**
 * PR #74 column alignment: fixed 1.0F slot + 0.2F gap + number; left edges align per column.
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { copySiteForPlaywright } from './lib/copy-site-for-playwright.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOL_PX = 1;
const CREAM_BOUNDS_TOL_PX = 1;
const PR74_BASELINE_TOL_PX = 2;

/** Offline layout probes: demo payload + local transport (never default cloud auto-pair). */
export const BOARD_LAYOUT_HARNESS_QUERY = 'demo=0&mode=local';

/**
 * @param {string} base
 * @returns {string}
 */
export function boardLayoutHarnessUrl(base) {
  return base + '?' + BOARD_LAYOUT_HARNESS_QUERY;
}

/**
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
export async function assertLayoutHarnessAvoidsCloudAutoPair(page) {
  const url = new URL(page.url());
  if (url.searchParams.get('mode') !== 'local' || url.searchParams.get('demo') !== '0') {
    throw new Error('layout harness must use demo=0&mode=local, got ' + url.search);
  }
  const state = await page.evaluate(() => {
    const root = document.getElementById('board-root');
    return {
      bootError: Boolean(root && root.classList.contains('boot-error-stage')),
      autoPairStarted: Boolean(window.__milkshaBoardAutoPairController),
    };
  });
  if (state.bootError) {
    throw new Error('layout harness opened boot-error surface');
  }
  if (state.autoPairStarted) {
    throw new Error('layout harness must not start board auto-pair (cloud boot)');
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {string} base
 * @returns {Promise<void>}
 */
export async function gotoLayoutHarness(page, base) {
  await page.goto(boardLayoutHarnessUrl(base), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.QMS && window.QMS.runtime && window.QMS.runtime.applyPayload);
  await assertLayoutHarnessAvoidsCloudAutoPair(page);
}

/** Four sources, varying number widths (5-char Uber, hash fp, point, store). */
export const ALIGNMENT_SAMPLE_PAYLOAD = [
  { source_type: 'From_UberEat_Preparing', number: 'A2C9E' },
  { source_type: 'From_FoodPanda_Preparing', number: '#6406' },
  { source_type: 'From_milksha_point_Preparing', number: '097' },
  { source_type: 'From_Store_Preparing', number: '2218' },
  { source_type: 'From_UberEat_Preparing', number: 'BFBEF' },
  { source_type: 'From_FoodPanda_Preparing', number: '#6405' },
  { source_type: 'From_milksha_point_Preparing', number: '096' },
  { source_type: 'From_Store_Preparing', number: '2217' },
  { source_type: 'From_UberEat_Preparing', number: 'C3D4E' },
  { source_type: 'From_FoodPanda_Preparing', number: '1234' },
];

function prepareSite() {
  const { siteRoot } = copySiteForPlaywright(rootDir);
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

async function disposePlaywrightSession(browser, server) {
  if (browser) {
    try {
      await browser.close();
    } catch (_err) {
      // ignore close errors after failed launch
    }
  }
  if (server) {
    await new Promise(function (resolve) {
      server.close(function () {
        resolve(undefined);
      });
    });
  }
}

let portSeq = 0;
function ephemeralPort() {
  portSeq += 1;
  return 8800 + ((process.pid + portSeq) % 200);
}

/**
 * @returns {Promise<{ ok: boolean, tolPx: number, zones: object, failures: string[] }>}
 */
/**
 * @returns {Promise<{ ok: boolean, violations: object[], failures: string[] }>}
 */
export async function runCreamColumnBoundsCheck(options) {
  const opts = options || {};
  const payload = opts.payload || buildFullBoardMixedPayload();
  const { siteRoot, base, port } = prepareSite();
  const server = await startServer(siteRoot, port);
  let browser;
  try {
    browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await gotoLayoutHarness(page, base);
  await page.evaluate((rows) => {
    const off = document.getElementById('milksha-cloud-offline');
    if (off) {
      off.hidden = true;
    }
    window.QMS.runtime.applyPayload(rows, { silent: true });
  }, payload);
  await page.waitForSelector('.milksha-prep .milksha-board-chip');
  await page.waitForFunction(() => {
    for (const img of document.querySelectorAll('.milksha-board-icon')) {
      if (!img.complete || img.naturalWidth === 0) {
        return false;
      }
    }
    return document.querySelectorAll('.milksha-board-icon').length >= 4;
  });

  const result = await page.evaluate(function (tol) {
    const art = window.QMS.Board.LandscapeArtLayout;
    const canvas = document.getElementById('milksha-board-canvas');
    const cRect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const m = canvas && canvas.style.transform ? canvas.style.transform.match(/scale\(([^)]+)\)/) : null;
    const scale = m ? Number(m[1]) : 1;

    function boardRect(el) {
      const r = el.getBoundingClientRect();
      return {
        left: (r.left - cRect.left) / scale,
        top: (r.top - cRect.top) / scale,
        right: (r.right - cRect.left) / scale,
        bottom: (r.bottom - cRect.top) / scale,
        width: r.width / scale,
        height: r.height / scale,
      };
    }

    const violations = [];
    ['prep', 'ready'].forEach(function (zoneKey) {
      const innerCols = art.columnInnerRectsBoard(zoneKey);
      const cream = art.creamRectForZone(zoneKey);
      const creamBox = {
        left: cream.left,
        top: cream.top,
        right: cream.left + cream.width - 1,
        bottom: cream.top + cream.height - 1,
      };
      const cells = Array.from(document.querySelectorAll('.milksha-zone.' + zoneKey + ' .milksha-num-cell'));
      cells.forEach(function (cell, index) {
        const chip = cell.querySelector('.milksha-board-chip');
        const num = cell.querySelector('.milksha-num');
        if (!chip || !num || !num.textContent) {
          return;
        }
        const col = index < 5 ? 0 : 1;
        const band = innerCols[col];
        const parts = [
          { kind: 'chip', el: chip },
          { kind: 'num', el: num },
        ];
        const iconBox = chip.querySelector('.milksha-board-icon-box');
        if (iconBox) {
          parts.push({ kind: 'iconBox', el: iconBox });
        }
        parts.forEach(function (part) {
          const r = boardRect(part.el);
          if (
            r.left < band.left - tol ||
            r.right > band.right + tol ||
            r.top < creamBox.top - tol ||
            r.bottom > creamBox.bottom + tol
          ) {
            violations.push({
              zone: zoneKey,
              index: index,
              number: num.textContent.trim(),
              kind: part.kind,
              rect: r,
              band: band,
              cream: creamBox,
            });
          }
        });
      });
    });
    return { ok: violations.length === 0, tolPx: tol, violations: violations };
  }, CREAM_BOUNDS_TOL_PX);

  const failures = result.violations.map(function (v) {
    return (
      v.zone +
      ' i' +
      v.index +
      ' ' +
      v.number +
      ' ' +
      v.kind +
      ' overflow band L' +
      v.band.left +
      ' R' +
      v.band.right +
      ' got L' +
      v.rect.left.toFixed(1) +
      ' R' +
      v.rect.right.toFixed(1)
    );
  });
  return { ok: result.ok, tolPx: CREAM_BOUNDS_TOL_PX, violations: result.violations, failures: failures };
  } finally {
    await disposePlaywrightSession(browser, server);
  }
}

export async function runColumnAlignmentCheck(options) {
  const opts = options || {};
  const payload = opts.payload || ALIGNMENT_SAMPLE_PAYLOAD;
  const { siteRoot, base, port } = prepareSite();
  const server = await startServer(siteRoot, port);
  let browser;
  try {
    browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await gotoLayoutHarness(page, base);
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

  return result;
  } finally {
    await disposePlaywrightSession(browser, server);
  }
}

export async function captureFullBoardScreenshot(options) {
  const opts = options || {};
  const outPath = opts.outPath || join(rootDir, 'artifacts', 'milksha-official-board', 'milksha-official-board-1920x1080.png');
  const payload = opts.payload;
  const { siteRoot, base, port } = prepareSite();
  const server = await startServer(siteRoot, port);
  let browser;
  try {
    browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await gotoLayoutHarness(page, base);
  await page.evaluate((rows) => {
    const off = document.getElementById('milksha-cloud-offline');
    const paused = document.getElementById('milksha-cloud-paused');
    if (off) {
      off.hidden = true;
      off.setAttribute('hidden', 'hidden');
    }
    if (paused) {
      paused.hidden = true;
      paused.setAttribute('hidden', 'hidden');
    }
    if (window.QMS.runtime.setCloudOfflineVisible) {
      window.QMS.runtime.setCloudOfflineVisible(false);
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
  await page.evaluate(function () {
    if (window.QMS.runtime.setCloudOfflineVisible) {
      window.QMS.runtime.setCloudOfflineVisible(false);
    }
    const off = document.getElementById('milksha-cloud-offline');
    const paused = document.getElementById('milksha-cloud-paused');
    if (off) {
      off.remove();
    }
    if (paused) {
      paused.remove();
    }
  });
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
  return { outPath: outPath, alignment: alignment };
  } finally {
    await disposePlaywrightSession(browser, server);
  }
}

/** 10 prep + 10 ready, mixed sources, distinct ids per zone. */
export function buildFullBoardMixedPayload() {
  const prepNos = [
    { sourceKey: 'uber', no: 'A2C9E' },
    { sourceKey: 'fp', no: '#6406' },
    { sourceKey: 'point', no: '097' },
    { sourceKey: 'store', no: '2218' },
    { sourceKey: 'uber', no: 'BFBEF' },
    { sourceKey: 'fp', no: '#6405' },
    { sourceKey: 'point', no: '096' },
    { sourceKey: 'store', no: '2217' },
    { sourceKey: 'uber', no: 'C3D4E' },
    { sourceKey: 'fp', no: '1234' },
  ];
  const readyNos = [
    { sourceKey: 'store', no: '8801' },
    { sourceKey: 'point', no: '802' },
    { sourceKey: 'fp', no: '8803' },
    { sourceKey: 'uber', no: 'D4E5F' },
    { sourceKey: 'store', no: '8804' },
    { sourceKey: 'point', no: '805' },
    { sourceKey: 'fp', no: '8806' },
    { sourceKey: 'uber', no: 'E5F6A' },
    { sourceKey: 'store', no: '8807' },
    { sourceKey: 'point', no: '808' },
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

/** 10+10 stress: widest compliant labels per source @ 64px. */
export function buildWorstCaseStressPayload() {
  const prepNos = [
    { sourceKey: 'uber', no: 'DDDDD' },
    { sourceKey: 'fp', no: '888888' },
    { sourceKey: 'point', no: '888' },
    { sourceKey: 'store', no: '8888' },
    { sourceKey: 'uber', no: 'BBBBB' },
    { sourceKey: 'fp', no: '777777' },
    { sourceKey: 'point', no: '777' },
    { sourceKey: 'store', no: '7777' },
    { sourceKey: 'uber', no: 'EEEEE' },
    { sourceKey: 'fp', no: '666666' },
  ];
  const readyNos = [
    { sourceKey: 'uber', no: 'FFFFF' },
    { sourceKey: 'fp', no: '555555' },
    { sourceKey: 'point', no: '555' },
    { sourceKey: 'store', no: '5555' },
    { sourceKey: 'uber', no: 'AAAAA' },
    { sourceKey: 'fp', no: '444444' },
    { sourceKey: 'point', no: '444' },
    { sourceKey: 'store', no: '4444' },
    { sourceKey: 'uber', no: 'CCCCC' },
    { sourceKey: 'fp', no: '333333' },
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

/**
 * Measure board coords vs PR #74 preview anchor math (icon slot + num @ 1.2F).
 */
export async function measurePr74BaselineCoords(options) {
  const opts = options || {};
  const payload = opts.payload || ALIGNMENT_SAMPLE_PAYLOAD;
  const fontPx = opts.fontPx || 64;
  const { siteRoot, base, port } = prepareSite();
  const server = await startServer(siteRoot, port);
  let browser;
  try {
    browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await gotoLayoutHarness(page, base);
  await page.evaluate((rows) => {
    document.getElementById('milksha-cloud-offline')?.setAttribute('hidden', 'hidden');
    window.QMS.runtime.applyPayload(rows, { silent: true });
  }, payload);
  await page.waitForSelector('.milksha-prep .milksha-board-chip');

  const rows = await page.evaluate(function (fontPxLocal) {
    const art = window.QMS.Board.LandscapeArtLayout;
    const canvas = document.getElementById('milksha-board-canvas');
    const cRect = canvas.getBoundingClientRect();
    const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
    const scale = m ? Number(m[1]) : 1;
    function boardLeft(el) {
      return (el.getBoundingClientRect().left - cRect.left) / scale;
    }
    const out = [];
    ['prep', 'ready'].forEach(function (zoneKey) {
      const inners = art.columnInnerRectsBoard(zoneKey);
      const cells = Array.from(document.querySelectorAll('.milksha-zone.' + zoneKey + ' .milksha-num-cell'));
      cells.forEach(function (cell, index) {
        const chip = cell.querySelector('.milksha-board-chip');
        const num = cell.querySelector('.milksha-num');
        const slot = cell.querySelector('.milksha-board-icon-slot');
        if (!chip || !num || !num.textContent) {
          return;
        }
        const col = index < 5 ? 0 : 1;
        const expectedIconLeft = inners[col].left;
        const expectedNumLeft =
          expectedIconLeft + art.ICON_BOX_PX + art.ICON_GAP_PX;
        const iconBox = chip.querySelector('.milksha-board-icon-box');
        out.push({
          zone: zoneKey,
          index: index,
          number: num.textContent.trim(),
          iconSlotLeft: slot ? Math.round(boardLeft(slot) * 100) / 100 : null,
          iconBoxLeft: iconBox ? Math.round(boardLeft(iconBox) * 100) / 100 : null,
          numLeft: Math.round(boardLeft(num) * 100) / 100,
          expectedIconSlotLeft: expectedIconLeft,
          expectedNumLeft: expectedNumLeft,
        });
      });
    });
    return out;
  }, fontPx);

  return rows;
  } finally {
    await disposePlaywrightSession(browser, server);
  }
}

const REF_UI_ICON_TOL_PX = 2;

export async function measureRefUiIconAnchors(options) {
  const opts = options || {};
  const payload = opts.payload || buildFullBoardMixedPayload();
  const { siteRoot, base, port } = prepareSite();
  const server = await startServer(siteRoot, port);
  let browser;
  try {
    browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await gotoLayoutHarness(page, base);
  await page.evaluate((rows) => {
    document.getElementById('milksha-cloud-offline')?.setAttribute('hidden', 'hidden');
    window.QMS.runtime.applyPayload(rows, { silent: true });
  }, payload);
  await page.waitForSelector('.milksha-prep .milksha-board-icon-box');

  const result = await page.evaluate(function (tol) {
    const art = window.QMS.Board.LandscapeArtLayout;
    const canvas = document.getElementById('milksha-board-canvas');
    const cRect = canvas.getBoundingClientRect();
    const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
    const scale = m ? Number(m[1]) : 1;
    function boardLeft(el) {
      return (el.getBoundingClientRect().left - cRect.left) / scale;
    }
    const failures = [];
    ['prep', 'ready'].forEach(function (zoneKey) {
      [0, 1].forEach(function (col) {
        const expected = art.iconBoxLeftBoard(zoneKey, col);
        const cell = document.querySelector(
          '.milksha-zone.' + zoneKey + ' .milksha-num-cell:nth-child(' + (col * 5 + 1) + ')',
        );
        const box = cell && cell.querySelector('.milksha-board-icon-box');
        if (!box) {
          return;
        }
        const got = boardLeft(box);
        if (Math.abs(got - expected) > tol) {
          failures.push(zoneKey + ' col' + col + ' iconBoxLeft ' + got.toFixed(2) + ' expected ' + expected);
        }
      });
    });
    return { ok: failures.length === 0, failures: failures };
  }, opts.tolPx ?? REF_UI_ICON_TOL_PX);

  return result;
  } finally {
    await disposePlaywrightSession(browser, server);
  }
}

/** UI compare layout: fp×3+point×2 | uber×3+point×2 per zone (newest-first grid). */
export function buildRefLayoutComparisonPayload() {
  const prep = [
    { source_type: 'From_milksha_point_Preparing', number: '898' },
    { source_type: 'From_milksha_point_Preparing', number: '899' },
    { source_type: 'From_UberEat_Preparing', number: 'A1899' },
    { source_type: 'From_UberEat_Preparing', number: 'A1901' },
    { source_type: 'From_UberEat_Preparing', number: 'A1902' },
    { source_type: 'From_milksha_point_Preparing', number: '903' },
    { source_type: 'From_milksha_point_Preparing', number: '904' },
    { source_type: 'From_FoodPanda_Preparing', number: '1905' },
    { source_type: 'From_FoodPanda_Preparing', number: '1906' },
    { source_type: 'From_FoodPanda_Preparing', number: '1907' },
  ];
  const ready = [
    { source_type: 'From_milksha_point_OK', number: '798' },
    { source_type: 'From_milksha_point_OK', number: '799' },
    { source_type: 'From_UberEat_OK', number: 'B2899' },
    { source_type: 'From_UberEat_OK', number: 'B2901' },
    { source_type: 'From_UberEat_OK', number: 'B2902' },
    { source_type: 'From_milksha_point_OK', number: '803' },
    { source_type: 'From_milksha_point_OK', number: '804' },
    { source_type: 'From_FoodPanda_OK', number: '2905' },
    { source_type: 'From_FoodPanda_OK', number: '2906' },
    { source_type: 'From_FoodPanda_OK', number: '2907' },
  ];
  return prep.concat(ready);
}

export async function runPr74BaselineCheck(options) {
  const opts = options || {};
  const tol = opts.tolPx ?? PR74_BASELINE_TOL_PX;
  const rows = await measurePr74BaselineCoords(opts);
  const failures = [];
  rows.forEach(function (row) {
    if (row.iconSlotLeft != null && Math.abs(row.iconSlotLeft - row.expectedIconSlotLeft) > tol) {
      failures.push(
        row.zone +
          ' i' +
          row.index +
          ' iconSlotLeft ' +
          row.iconSlotLeft +
          ' expected ' +
          row.expectedIconSlotLeft,
      );
    }
    if (Math.abs(row.numLeft - row.expectedNumLeft) > tol) {
      failures.push(
        row.zone + ' i' + row.index + ' numLeft ' + row.numLeft + ' expected ' + row.expectedNumLeft,
      );
    }
  });
  return { ok: failures.length === 0, tolPx: tol, rows: rows, failures: failures };
}

/**
 * Smoke: layout harness must not enter cloud auto-pair boot (regression for PR #97).
 * @returns {Promise<{ ok: true }>}
 */
export async function verifyLayoutHarnessBootIsolation() {
  const { siteRoot, base, port } = prepareSite();
  const server = await startServer(siteRoot, port);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await gotoLayoutHarness(page, base);
    return { ok: true };
  } finally {
    await browser.close();
    await new Promise(function (r) {
      server.close(function () {
        r(undefined);
      });
    });
  }
}
