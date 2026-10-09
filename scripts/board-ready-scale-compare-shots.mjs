#!/usr/bin/env node
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-ready-fade-self-qa', 'screenshots');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);
const PULSE_ITEM_ID = 'store:9999';

function parseTransformScale(transform) {
  if (!transform || transform === 'none') {
    return 1;
  }
  if (transform.startsWith('matrix3d(')) {
    const parts = transform
      .slice(9, -1)
      .split(',')
      .map((s) => Number.parseFloat(s.trim()));
    return Number.isFinite(parts[0]) ? parts[0] : 1;
  }
  if (transform.startsWith('matrix(')) {
    const parts = transform
      .slice(7, -1)
      .split(',')
      .map((s) => Number.parseFloat(s.trim()));
    return Number.isFinite(parts[0]) ? parts[0] : 1;
  }
  const scaleMatch = /scale\(([^)]+)\)/.exec(transform);
  if (scaleMatch) {
    const n = Number.parseFloat(scaleMatch[1].split(',')[0].trim());
    return Number.isFinite(n) ? n : 1;
  }
  return 1;
}

function md5File(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

function scaleTag(scale) {
  return String(Math.round(scale * 1000) / 1000).replace('.', '_');
}

async function setupFullGridAndPulse(page) {
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
    const nine = [];
    for (let i = 0; i < 9; i += 1) {
      nine.push({ source_type: 'From_Store_OK', number: String(9990 + i) });
    }
    window.QMS.runtime.applyPayload(nine, { silent: true });
    const ten = [];
    for (let i = 0; i < 10; i += 1) {
      ten.push({ source_type: 'From_Store_OK', number: String(9990 + i) });
    }
    window.QMS.runtime.applyPayload(ten);
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.milksha-ready .milksha-board-chip').length === 10,
    { timeout: 15000 },
  );
}

async function waitForHoldScale(page, minScale, maxScale) {
  const inMs = await page.evaluate(() => window.QMS.MilkshaBoardAnimConfig.getConfig().readyScaleInMs);
  await page.waitForTimeout(inMs + 80);
  await page.waitForFunction(
    ({ id, min, max }) => {
      const el = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
      if (!el) {
        return false;
      }
      const tr = getComputedStyle(el).transform;
      const m = tr.match(/matrix\(([^)]+)\)/);
      let s = 1;
      if (m) {
        s = Number.parseFloat(m[1].split(',')[0]);
      } else {
        const sm = /scale\(([^)]+)\)/.exec(tr);
        if (sm) {
          s = Number.parseFloat(sm[1]);
        }
      }
      return s >= min - 0.03 && s <= max + 0.03;
    },
    { id: PULSE_ITEM_ID, min: minScale, max: maxScale },
    { timeout: 12000 },
  );
}

async function measurePulseState(page) {
  return page.evaluate((id) => {
    const layer = document.querySelector('.milksha-zone.ready .milksha-zone-numbers');
    const pulse = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
    const tr = pulse ? getComputedStyle(pulse).transform : 'none';
    const m = tr.match(/matrix\(([^)]+)\)/);
    let measuredScale = 1;
    if (m) {
      measuredScale = Number.parseFloat(m[1].split(',')[0]);
    }
    const cfg = window.QMS.MilkshaBoardAnimConfig.getEffectiveReadyScale(layer, pulse);
    const readyNums = [...document.querySelectorAll('.milksha-ready .milksha-num')].map((n) => n.textContent);
    const cell = pulse ? pulse.closest('.milksha-num-cell') : null;
    const cells = layer ? [...layer.querySelectorAll('.milksha-num-cell')] : [];
    const idx = cell ? cells.indexOf(cell) : -1;
    return {
      measuredScale: Math.round(measuredScale * 1000) / 1000,
      effective: cfg.effective,
      safeMax: cfg.safeMax,
      unsafeBypass: cfg.unsafeBypass,
      readyCount: readyNums.length,
      readyNumbers: readyNums,
      pulseCellIndex: idx,
    };
  }, PULSE_ITEM_ID);
}

async function nearestNeighborGapPx(page) {
  return page.evaluate((id) => {
    const pulse = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
    if (!pulse) {
      return Infinity;
    }
    const tr = getComputedStyle(pulse).transform;
    const m = tr.match(/matrix\(([^)]+)\)/);
    const scale = m ? Number.parseFloat(m[1].split(',')[0]) : 1;
    const r = pulse.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const ow = pulse.offsetWidth;
    const oh = pulse.offsetHeight;
    const ex = {
      left: cx - (ow * scale) / 2,
      right: cx + (ow * scale) / 2,
      top: cy - (oh * scale) / 2,
      bottom: cy + (oh * scale) / 2,
    };
    const others = [...document.querySelectorAll('.milksha-ready .milksha-board-chip')].filter(
      (el) => el.getAttribute('data-item-id') !== id,
    );
    let minGap = Infinity;
    for (let i = 0; i < others.length; i += 1) {
      const o = others[i].getBoundingClientRect();
      const gap = Math.max(ex.top - o.bottom, o.top - ex.bottom, ex.left - o.right, o.left - ex.right, 0);
      minGap = Math.min(minGap, gap);
    }
    return Math.round(minGap * 10) / 10;
  }, PULSE_ITEM_ID);
}

async function pulseOverlapsNeighbor(page) {
  return page.evaluate((id) => {
    const pulse = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
    if (!pulse) {
      return false;
    }
    const tr = getComputedStyle(pulse).transform;
    const m = tr.match(/matrix\(([^)]+)\)/);
    const scale = m ? Number.parseFloat(m[1].split(',')[0]) : 1;
    const r = pulse.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const ow = pulse.offsetWidth;
    const oh = pulse.offsetHeight;
    const expanded = {
      left: cx - (ow * scale) / 2,
      right: cx + (ow * scale) / 2,
      top: cy - (oh * scale) / 2,
      bottom: cy + (oh * scale) / 2,
    };
    const others = [...document.querySelectorAll('.milksha-ready .milksha-board-chip')].filter(
      (el) => el.getAttribute('data-item-id') !== id,
    );
    for (let i = 0; i < others.length; i += 1) {
      const o = others[i].getBoundingClientRect();
      const other = { left: o.left, right: o.right, top: o.top, bottom: o.bottom };
      if (
        expanded.left < other.right &&
        expanded.right > other.left &&
        expanded.top < other.bottom &&
        expanded.bottom > other.top
      ) {
        return true;
      }
    }
    return false;
  }, PULSE_ITEM_ID);
}

async function zoomClipAroundPulse(page) {
  return page.evaluate((id) => {
    const pulse = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
    if (!pulse) {
      return null;
    }
    const cell = pulse.closest('.milksha-num-cell');
    const layer = document.querySelector('.milksha-zone.ready .milksha-zone-numbers');
    const cells = layer ? [...layer.querySelectorAll('.milksha-num-cell')] : [];
    const idx = cell ? cells.indexOf(cell) : -1;
    const neighbors = [];
    if (idx >= 0) {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      if (col > 0) {
        neighbors.push(cells[idx - 1]);
      }
      if (col < 1) {
        neighbors.push(cells[idx + 1]);
      }
      if (row > 0) {
        neighbors.push(cells[idx - 2]);
      }
      if (row * 2 + 2 < cells.length) {
        neighbors.push(cells[idx + 2]);
      }
    }
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const addRect = (el) => {
      if (!el) {
        return;
      }
      const r = el.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    };
    addRect(pulse);
    for (let i = 0; i < neighbors.length; i += 1) {
      const chip = neighbors[i].querySelector('.milksha-board-chip');
      addRect(chip || neighbors[i]);
    }
    const pad = 12;
    return {
      x: Math.max(0, Math.floor(left - pad)),
      y: Math.max(0, Math.floor(top - pad)),
      width: Math.ceil(right - left + pad * 2),
      height: Math.ceil(bottom - top + pad * 2),
    };
  }, PULSE_ITEM_ID);
}

/** @type {Record<string, number>} */
const safeGapByViewport = {};

async function captureMode(browser, vp, mode, manifest) {
  const unsafe = mode === 'unsafe';
  const query = unsafe
    ? `?mode=local&animScaleUnsafe=1&animScale=1.3`
    : `?mode=local`;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/${query}`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload));

  await setupFullGridAndPulse(page);

  const expected = await page.evaluate((id) => {
    const layer = document.querySelector('.milksha-zone.ready .milksha-zone-numbers');
    const chip = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
    return window.QMS.MilkshaBoardAnimConfig.getEffectiveReadyScale(layer, chip);
  }, PULSE_ITEM_ID);

  const targetMin = unsafe ? 1.27 : Math.max(1.01, expected.effective - 0.05);
  const targetMax = unsafe ? 1.33 : Math.min(1.3, expected.effective + 0.05);
  await waitForHoldScale(page, targetMin, targetMax);

  const state = await measurePulseState(page);
  if (state.readyCount !== 10) {
    throw new Error(`${mode} @ ${vp.tag}: expected 10 ready chips, got ${state.readyCount}`);
  }

  const nearestGap = await nearestNeighborGapPx(page);
  if (unsafe) {
    if (state.measuredScale < 1.27) {
      throw new Error(`${mode}: scale ${state.measuredScale} not ~1.3`);
    }
    const safeGap = safeGapByViewport[vp.tag];
    if (Number.isFinite(safeGap) && nearestGap >= safeGap - 2) {
      throw new Error(
        `${mode}: gap ${nearestGap}px must be tighter than safe ${safeGap}px at scale 1.3`,
      );
    }
    const overlaps = await pulseOverlapsNeighbor(page);
    if (!overlaps && nearestGap > 25 && (!Number.isFinite(safeGap) || nearestGap >= safeGap - 2)) {
      throw new Error(`${mode}: expected encroach vs safe (gap ${nearestGap}px)`);
    }
  } else {
    const safeCap = Math.min(1.3, state.safeMax);
    if (state.safeMax < 1.26 && Math.abs(state.measuredScale - safeCap) > 0.06) {
      throw new Error(`${mode}: measured ${state.measuredScale} vs safe cap ${safeCap}`);
    }
    if (state.measuredScale >= 1.27) {
      throw new Error(`${mode}: safe scale must stay below 1.27, got ${state.measuredScale}`);
    }
    const overlaps = await pulseOverlapsNeighbor(page);
    if (overlaps) {
      throw new Error(`${mode}: safe shot must not overlap neighbours`);
    }
    safeGapByViewport[vp.tag] = nearestGap;
  }

  const tag = scaleTag(state.measuredScale);
  const base = `${vp.tag}-fullboard-${mode}-scale-${tag}`;
  const fullName = `${base}.png`;
  const fullPath = join(ART, fullName);
  await page.screenshot({ path: fullPath, fullPage: false });

  const clip = await zoomClipAroundPulse(page);
  let zoomPath = null;
  if (clip && clip.width > 0 && clip.height > 0) {
    const zoomCtx = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: 2,
    });
    const zoomPage = await zoomCtx.newPage();
    await zoomPage.goto(`http://127.0.0.1:${PORT}/${query}`);
    await zoomPage.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload));
    await setupFullGridAndPulse(zoomPage);
    await waitForHoldScale(zoomPage, targetMin, targetMax);
    const half = {
      x: clip.x + clip.width / 4,
      y: clip.y + clip.height / 4,
      width: clip.width / 2,
      height: clip.height / 2,
    };
    const zoomName = `${base}-zoom2x.png`;
    zoomPath = join(ART, zoomName);
    await zoomPage.screenshot({ path: zoomPath, clip: half });
    await zoomCtx.close();
  }

  manifest.shots.push({
    mode,
    viewport: vp.tag,
    measuredScale: state.measuredScale,
    effective: state.effective,
    safeMax: state.safeMax,
    nearestNeighborGapPx: nearestGap,
    pulseCellIndex: state.pulseCellIndex,
    readyNumbers: state.readyNumbers,
    fullboard: fullName,
    zoom2x: zoomPath ? `${base}-zoom2x.png` : null,
    md5: md5File(fullPath),
    md5Zoom: zoomPath ? md5File(zoomPath) : null,
  });

  await ctx.close();
}

async function main() {
  const { startSite } = await import('../tests/e2e/harness.mjs');
  await startSite();
  mkdirSync(ART, { recursive: true });

  const manifest = { generatedAt: new Date().toISOString(), shots: [] };
  const browser = await chromium.launch();
  const viewports = [
    { width: 1920, height: 1080, tag: '1920x1080' },
    { width: 3840, height: 2160, tag: '3840x2160' },
  ];

  for (const vp of viewports) {
    await captureMode(browser, vp, 'safe', manifest);
    await captureMode(browser, vp, 'unsafe', manifest);
  }
  await browser.close();

  const byVp = {};
  for (const s of manifest.shots) {
    if (!byVp[s.viewport]) {
      byVp[s.viewport] = {};
    }
    byVp[s.viewport][s.mode] = s;
  }
  for (const vp of Object.keys(byVp)) {
    const pair = byVp[vp];
    if (pair.safe && pair.unsafe && pair.safe.md5 === pair.unsafe.md5) {
      throw new Error(`${vp}: safe and unsafe PNG md5 must differ`);
    }
  }

  const manifestPath = join(ART, 'compare-shots-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('wrote', manifestPath);
  console.log(JSON.stringify(manifest.shots.map((s) => ({ vp: s.viewport, mode: s.mode, scale: s.measuredScale, md5: s.md5 })), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
