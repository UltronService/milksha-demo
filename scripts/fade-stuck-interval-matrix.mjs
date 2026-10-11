#!/usr/bin/env node
/**
 * Interval matrix: 5× send-numbers at configurable gaps; sample in-cell chip opacity every 500ms.
 *
 * Usage:
 *   node scripts/fade-stuck-interval-matrix.mjs --mode fake --gaps 1000,5000,200 --rounds 3
 *   LIVE_CLOUD_STORE_ID=zz-qa-ci-store node scripts/fade-stuck-interval-matrix.mjs --mode live --gaps 1000,5000 --rounds 3
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  ensureCloudRunning,
  resetCloudState,
  startSite,
  installBundledCloudRouteShim,
  PORT_SITE,
} from '../tests/e2e/harness.mjs';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from '../tests/e2e/board-animation-live-setup.mjs';
import { LIVE_CLOUD_BOARD_DEVICE, LIVE_CLOUD_STORE_ID } from '../tests/e2e/live-cloud-config.mjs';
import { sendClearNow, teardownLiveCloudSession } from '../tests/e2e/live-cloud-teardown.mjs';

const STORE = String(process.env.LIVE_CLOUD_STORE_ID || LIVE_CLOUD_STORE_ID || 'zz-qa-ci-store').trim();
const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'fake';
const roundsArg = process.argv.includes('--rounds') ? Number(process.argv[process.argv.indexOf('--rounds') + 1]) : 3;
const gapsArg = process.argv.includes('--gaps') ? process.argv[process.argv.indexOf('--gaps') + 1] : '1000,5000';
const sampleMs = process.argv.includes('--sample-ms')
  ? Number(process.argv[process.argv.indexOf('--sample-ms') + 1])
  : 500;
const postSendWatchMs = process.argv.includes('--watch-ms')
  ? Number(process.argv[process.argv.indexOf('--watch-ms') + 1])
  : 45000;

const ROUNDS = Number.isFinite(roundsArg) && roundsArg > 0 ? roundsArg : 3;
const GAPS = gapsArg
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 0);

const DBG_FADE_INIT = () => {
  window.__dbgFade = [];
  const origAnimate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const el = this;
    const anim = origAnimate.call(this, keyframes, options);
    if (!el?.classList?.contains?.('milksha-board-chip')) {
      return anim;
    }
    const id = el.getAttribute('data-item-id') || '';
    const num = el.querySelector?.('.milksha-num')?.textContent?.trim() || '';
    const hasOpacityKf =
      Array.isArray(keyframes) &&
      keyframes.some((k) => k && Object.prototype.hasOwnProperty.call(k, 'opacity'));
    window.__dbgFade.push({
      t: performance.now(),
      ev: 'waapi-start',
      id,
      num,
      hasOpacityKf,
      fill: options?.fill || '',
    });
    anim.addEventListener('cancel', () => {
      const inline = el.style.opacity;
      const computed = getComputedStyle(el).opacity;
      window.__dbgFade.push({
        t: performance.now(),
        ev: 'waapi-cancel',
        id,
        num,
        inlineOpacity: inline,
        computedOpacity: computed,
      });
    });
    anim.addEventListener('finish', () => {
      window.__dbgFade.push({
        t: performance.now(),
        ev: 'waapi-finish',
        id,
        num,
        inlineOpacity: el.style.opacity,
        computedOpacity: getComputedStyle(el).opacity,
      });
    });
    return anim;
  };
};

async function sampleChips(board) {
  return board.evaluate(() => {
    const chips = [...document.querySelectorAll('.milksha-board-chip:not(.milksha-board-chip--layer-float)')].filter(
      (el) => el.closest('.milksha-ready'),
    );
    return {
      readyNums: document.querySelectorAll('.milksha-ready .milksha-num').length,
      chips: chips.map((el) => ({
        num: el.querySelector('.milksha-num')?.textContent?.trim() || '',
        inlineOpacity: el.style.opacity,
        computedOpacity: getComputedStyle(el).opacity,
        inCell: Boolean(el.closest('.milksha-num-cell')),
        animCount: typeof el.getAnimations === 'function' ? el.getAnimations().length : 0,
      })),
      perfTail: (window.__milkshaBoardPerfEvents || []).slice(-20),
      dbgTail: (window.__dbgFade || []).slice(-30),
      skipReason: window.QMS?.runtime?.getAnimSkipReason?.() ?? null,
    };
  });
}

function summarizeSample(snap) {
  const inCell = snap.chips.filter((c) => c.inCell);
  const opaque = inCell.filter((c) => {
    const o = parseFloat(c.computedOpacity);
    return Number.isFinite(o) && o >= 0.99;
  });
  const transparent = inCell.filter((c) => {
    const o = parseFloat(c.computedOpacity);
    return Number.isFinite(o) && o < 0.01;
  });
  return {
    inCell: inCell.length,
    opaque: opaque.length,
    transparent: transparent.length,
    opaqueNums: opaque.map((c) => c.num).sort(),
    transparentNums: transparent.map((c) => c.num).sort(),
  };
}

async function connectFake(ctx) {
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await installBundledCloudRouteShim(board);
  await installBundledCloudRouteShim(ctrl);
  const base = `http://127.0.0.1:${PORT_SITE}`;
  await board.goto(`${base}/?mode=cloud&store=${STORE}&device=stb-01`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 60000 });
  await ctrl.goto(`${base}/controller/?mode=cloud&store=${STORE}`);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 60000 });
  return { board, ctrl };
}

async function connectLive(ctx) {
  await installLiveBranchCloudRoutes(ctx);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await board.addInitScript(DBG_FADE_INIT);
  const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await board.goto(`${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=${LIVE_CLOUD_BOARD_DEVICE}`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
  await ctrlNav;
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  await ctrl.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-board-online') === '1',
    undefined,
    { timeout: 180000 },
  );
  return { board, ctrl };
}

async function runRound(board, ctrl, gapMs) {
  await board.evaluate(() => {
    window.QMS?.runtime?.clearPerfEvents?.();
    window.__dbgFade = [];
  });
  await sendClearNow(ctrl);
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-board-chip').length === 0,
    undefined,
    { timeout: 30000 },
  );

  const sendMarks = [];
  for (let i = 0; i < 5; i += 1) {
    const t0 = Date.now();
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
      i + 1,
      { timeout: 60000 },
    );
    sendMarks.push({ sendIndex: i + 1, elapsedMs: Date.now() - t0 });
    if (i < 4 && gapMs > 0) {
      await board.waitForTimeout(gapMs);
    }
  }

  const lastSendAt = Date.now();
  const timeline = [];
  for (let elapsed = 0; elapsed <= postSendWatchMs; elapsed += sampleMs) {
    if (elapsed > 0) {
      await board.waitForTimeout(sampleMs);
    }
    const snap = await sampleChips(board);
    timeline.push({
      msAfterLastSend: elapsed,
      summary: summarizeSample(snap),
      snap,
    });
  }

  const dbgFade = await board.evaluate(() => (window.__dbgFade || []).slice());
  const cancelEvents = dbgFade.filter((e) => e.ev === 'waapi-cancel' && e.hasOpacityKf !== false);

  return {
    gapMs,
    sendMarks,
    timeline,
    finalAt45s: timeline[timeline.length - 1]?.summary ?? null,
    dbgFadeStats: {
      total: dbgFade.length,
      cancel: dbgFade.filter((e) => e.ev === 'waapi-cancel').length,
      finish: dbgFade.filter((e) => e.ev === 'waapi-finish').length,
      cancelWithLowOpacity: dbgFade.filter(
        (e) => e.ev === 'waapi-cancel' && parseFloat(e.computedOpacity) < 0.01,
      ).length,
    },
    dbgFadeTail: dbgFade.slice(-40),
    cancelEvents,
  };
}

async function main() {
  const results = { mode, store: STORE, rounds: ROUNDS, gaps: GAPS, sampleMs, postSendWatchMs, byGap: {} };

  if (mode === 'fake') {
    await ensureCloudRunning();
    await startSite();
    await resetCloudState({ seedDevice: true });
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(180000);

  if (mode === 'fake') {
    await ctx.addInitScript(DBG_FADE_INIT);
  }

  const { board, ctrl } = mode === 'live' ? await connectLive(ctx) : await connectFake(ctx);

  for (const gapMs of GAPS) {
    const rounds = [];
    for (let r = 0; r < ROUNDS; r += 1) {
      rounds.push(await runRound(board, ctrl, gapMs));
    }
    const stuckAt45 = rounds.filter(
      (row) => row.finalAt45s && row.finalAt45s.inCell >= 5 && row.finalAt45s.opaque < 5,
    ).length;
    results.byGap[String(gapMs)] = {
      rounds,
      stuckNotAllOpaqueAt45s: `${stuckAt45}/${ROUNDS}`,
      avgTransparentAt45s:
        rounds.reduce((a, row) => a + (row.finalAt45s?.transparent ?? 0), 0) / Math.max(1, rounds.length),
    };
  }

  if (mode === 'live') {
    await teardownLiveCloudSession(ctrl, board);
  }
  await browser.close();

  const outDir = path.join(process.cwd(), 'artifacts/fade-stuck');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `interval-matrix-${mode}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ outFile, byGap: results.byGap }, null, 2));
}

await main();
