#!/usr/bin/env node
/**
 * QA concat repro — 1 Hz sampler (adapted from QA run-bugconcat-repro.mjs).
 * Local: MILKSHA_E2E_PORT=8877 node scripts/run-bugconcat-repro.mjs
 * Public: BUGCONCAT_PUBLIC=1 node scripts/run-bugconcat-repro.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTROLLER_BOARD_ONLINE_WAIT_JS } from './lib/controller-board-online.mjs';
import { waitForReceiverOnline } from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts/board-concat-bug/qa-repro');
const LOG = join(ART, 'run.log');
const SAMPLE_MS = 1000;
const ORPHAN_MS = 1000;
const PORT = process.env.MILKSHA_E2E_PORT || '8877';
const USE_PUBLIC = process.env.BUGCONCAT_PUBLIC === '1';
const PUBLIC_BASE = 'https://ultronservice.github.io/milksha-demo';
const LOCAL_BASE = `http://127.0.0.1:${PORT}`;
const BASE = USE_PUBLIC ? PUBLIC_BASE : LOCAL_BASE;
const STORE_A = 'zz-qa-store-a';
const DEVICE = 'stb-01';

mkdirSync(ART, { recursive: true });

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  appendFileSync(LOG, msg + '\n');
}

function taipeiNow() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date());
}

function boardUrl() {
  const u = new URL(`${BASE}/`);
  u.searchParams.set('mode', USE_PUBLIC ? 'cloud' : 'local');
  if (USE_PUBLIC) {
    u.searchParams.set('store', STORE_A);
    u.searchParams.set('device', DEVICE);
  }
  return u.toString();
}

function ctrlUrl() {
  const u = new URL(`${BASE}/controller/`);
  u.searchParams.set('mode', USE_PUBLIC ? 'cloud' : 'local');
  if (USE_PUBLIC) {
    u.searchParams.set('store', STORE_A);
  }
  return u.toString();
}

async function expandPos(ctrl) {
  await ctrl.evaluate(() => {
    const s = document.getElementById('sec-pos');
    const b = s?.querySelector('.zone-body');
    const t = s?.querySelector('.zone-toggle');
    if (t) t.setAttribute('aria-expanded', 'true');
    if (b) b.hidden = false;
  });
}

async function expandSpecial(ctrl) {
  await ctrl.evaluate(() => {
    const s = document.getElementById('sec-special');
    const b = s?.querySelector('.zone-body');
    const t = s?.querySelector('.zone-toggle');
    if (t) t.setAttribute('aria-expanded', 'true');
    if (b) b.hidden = false;
  });
}

async function waitBoard(board) {
  if (USE_PUBLIC) {
    await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
    await board.waitForFunction(
      () => document.getElementById('milksha-cloud-offline')?.hidden,
      undefined,
      { timeout: 180000 },
    );
    return;
  }
  await board.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), undefined, { timeout: 60000 });
}

async function waitCtrl(ctrl) {
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  if (USE_PUBLIC) {
    await ctrl.waitForFunction(CONTROLLER_BOARD_ONLINE_WAIT_JS, undefined, { timeout: 180000 });
    return;
  }
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 60000 });
}

async function clearBoard(ctrl, board) {
  await expandSpecial(ctrl);
  await ctrl.click('[data-testid="btn-clear-now"]');
  await board.waitForFunction(() => document.querySelectorAll('.milksha-board-chip').length === 0, undefined, {
    timeout: 120000,
  });
}

async function startSim(ctrl, mode) {
  await expandPos(ctrl);
  const testId = mode === 'peak' ? 'btn-gen-peak' : 'btn-gen-normal';
  await ctrl.locator(`[data-testid="${testId}"]`).click({ timeout: 10000 });
  await ctrl.evaluate((m) => window.__controller?.startStoreSimulation?.(m), mode);
}

async function stopSim(ctrl) {
  await expandPos(ctrl);
  await ctrl.evaluate(() => {
    document.querySelector('[data-testid="btn-sim-stop"]')?.click();
    window.__controller?.stopStoreSimulation?.('bugconcat');
  });
}

async function readTickets(ctrl) {
  return ctrl.evaluate(() => {
    const list = window.__controller?.getTickets?.() || [];
    return list.map((t) => ({
      no: String(t.no || ''),
      status: String(t.status || ''),
      sourceKey: t.sourceKey || '',
    }));
  });
}

async function readBoardSample(board) {
  return board.evaluate(() => {
    const readZone = (z) => {
      const layer = document.querySelector(`.milksha-zone.${z} .milksha-zone-numbers`);
      const cells = [...document.querySelectorAll(`.milksha-zone.${z} .milksha-num-cell`)];
      return {
        page: layer?.getAttribute('data-page') ?? null,
        pageTurnAnim: layer?.getAttribute('data-page-turn-anim') ?? null,
        cells: cells.map((cell, cellIndex) => {
          const chips = [...cell.querySelectorAll('.milksha-board-chip')];
          return {
            cellIndex,
            chipCount: chips.length,
            chips: chips.map((chip) => {
              const numEl = chip.querySelector('.milksha-num');
              const st = getComputedStyle(chip);
              return {
                id: chip.getAttribute('data-item-id'),
                text: numEl ? numEl.textContent.trim() : '',
                opacity: st.opacity,
                inCell: cell.contains(chip),
                layerFloat: chip.classList.contains('milksha-board-chip--layer-float'),
              };
            }),
          };
        }),
      };
    };
    const all = [...document.querySelectorAll('.milksha-board-chip')];
    const ids = all.map((c) => c.getAttribute('data-item-id')).filter(Boolean);
    const detached = document.querySelectorAll('.milksha-board-chip--layer-float').length;
    return {
      ts: Date.now(),
      visibility: document.visibilityState,
      animSkip: window.QMS?.runtime?.getAnimSkipReason?.() || '',
      prep: readZone('prep'),
      ready: readZone('ready'),
      duplicateItemIds: ids.length - new Set(ids).size,
      detachedFloatCount: detached,
      chipCount: all.length,
    };
  });
}

function analyzeFlags(sample, ticketNos, orphanSince) {
  const flags = [];
  const fourDigit = /^\d{4}$/;

  for (const zoneKey of ['prep', 'ready']) {
    const zone = sample.board[zoneKey];
    if (!zone) {
      continue;
    }
    for (const cell of zone.cells) {
      const inCellChips = cell.chips.filter((c) => c.inCell);
      if (inCellChips.length > 1) {
        flags.push({ kind: 'multi-chip-cell', zone: zoneKey, cellIndex: cell.cellIndex, chips: inCellChips });
      }
      if (inCellChips.length === 1 && inCellChips[0].text && !fourDigit.test(inCellChips[0].text)) {
        flags.push({ kind: 'bad-chip-text', zone: zoneKey, cellIndex: cell.cellIndex, text: inCellChips[0].text });
      }
      const concat = inCellChips.map((c) => c.text).join('');
      if (inCellChips.length > 1 || (concat && !fourDigit.test(concat))) {
        flags.push({ kind: 'bad-cell-concat', zone: zoneKey, cellIndex: cell.cellIndex, concat, chips: inCellChips });
      }
      for (const chip of inCellChips) {
        if (chip.text && fourDigit.test(chip.text) && !ticketNos.includes(chip.text)) {
          const key = chip.id || `${zoneKey}:${chip.text}`;
          const since = orphanSince.get(key) ?? sample.at;
          orphanSince.set(key, since);
          if (sample.at - since >= ORPHAN_MS) {
            flags.push({ kind: 'orphan-chip', zone: zoneKey, cellIndex: cell.cellIndex, chip, orphanMs: sample.at - since });
          }
        } else if (chip.id) {
          orphanSince.delete(chip.id);
        }
      }
    }
    const nums = zone.cells.flatMap((c) =>
      c.chips.filter((ch) => ch.inCell && !ch.layerFloat).map((ch) => ch.text).filter(Boolean),
    );
    const seen = new Set();
    for (const n of nums) {
      if (seen.has(n)) {
        flags.push({ kind: 'zone-dup-number', zone: zoneKey, text: n });
      }
      seen.add(n);
    }
  }

  if (sample.board.duplicateItemIds > 0) {
    flags.push({ kind: 'duplicate-data-item-id', count: sample.board.duplicateItemIds });
  }

  return flags;
}

async function setBoardHidden(board, hidden) {
  await board.evaluate((isHidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (isHidden ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

const BG_CYCLES = [
  { startOffsetMs: 2 * 60 * 1000, durationMs: 90 * 1000 },
  { startOffsetMs: 5 * 60 * 1000, durationMs: 120 * 1000 },
  { startOffsetMs: 8 * 60 * 1000, durationMs: 90 * 1000 },
  { startOffsetMs: 11 * 60 * 1000, durationMs: 90 * 1000 },
];

async function runScenario(ctx, board, ctrl, scenario) {
  const { id, mode, durationMs, backgroundCycles } = scenario;
  log(`scenario ${id} start mode=${mode} durationMs=${durationMs} base=${BASE}`);
  await clearBoard(ctrl, board);
  await startSim(ctrl, mode);
  const startedAt = Date.now();
  const endAt = startedAt + durationMs;
  const flags = [];
  const orphanSince = new Map();
  const bgSchedule = (backgroundCycles || []).map((bc, i) => ({
    ...bc,
    at: startedAt + bc.startOffsetMs,
    end: startedAt + bc.startOffsetMs + bc.durationMs,
    i,
  }));

  while (Date.now() < endAt) {
    const now = Date.now();
    for (const bc of bgSchedule) {
      if (!bc.applied && now >= bc.at && now < bc.end) {
        await setBoardHidden(board, true);
        bc.applied = true;
        log(`scenario ${id} background ${bc.i} start`);
      }
      if (bc.applied && now >= bc.end && !bc.restored) {
        await setBoardHidden(board, false);
        bc.restored = true;
        log(`scenario ${id} background ${bc.i} end`);
      }
    }
    const tickets = await readTickets(ctrl);
    const ticketNos = tickets.map((t) => t.no);
    const boardSample = await readBoardSample(board);
    const sample = { at: now, elapsedMs: now - startedAt, tickets, board: boardSample };
    const sampleFlags = analyzeFlags(sample, ticketNos, orphanSince);
    if (sampleFlags.length) {
      flags.push({ at: now, elapsedMs: now - startedAt, flags: sampleFlags });
      log(`FLAG ${id} ${JSON.stringify(sampleFlags)}`);
    }
    await board.waitForTimeout(SAMPLE_MS);
  }

  await stopSim(ctrl);
  return {
    id,
    mode,
    durationMs,
    flagEvents: flags,
    reproduced: flags.length > 0,
    sampleCount: Math.floor(durationMs / SAMPLE_MS),
  };
}

async function main() {
  writeFileSync(LOG, '');
  const scenarios = [
    { id: 'peak-15m-bg', mode: 'peak', durationMs: 15 * 60 * 1000, backgroundCycles: BG_CYCLES },
    { id: 'normal-15m-bg', mode: 'normal', durationMs: 15 * 60 * 1000, backgroundCycles: BG_CYCLES },
  ];
  const short = process.env.BUGCONCAT_SHORT === '1';
  if (short) {
    scenarios.forEach((s) => {
      s.durationMs = 90 * 1000;
    });
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await board.goto(boardUrl(), { waitUntil: 'domcontentloaded' });
  await waitBoard(board);
  await board.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
  });
  await ctrl.goto(ctrlUrl(), { waitUntil: 'domcontentloaded' });
  await waitCtrl(ctrl);
  if (!USE_PUBLIC) {
    await waitForReceiverOnline(board, 'local');
  }

  const results = [];
  for (const sc of scenarios) {
    results.push(await runScenario(ctx, board, ctrl, sc));
  }
  await clearBoard(ctrl, board);
  await board.close();
  await ctrl.close();
  await ctx.close();
  await browser.close();

  const report = {
    startedTaipei: taipeiNow(),
    base: BASE,
    branchBuild: !USE_PUBLIC,
    results,
    reproduced: results.some((r) => r.reproduced),
    tolerance: 0,
  };
  writeFileSync(join(ART, 'results.json'), JSON.stringify(report, null, 2));
  log(`done reproduced=${report.reproduced}`);
  process.exit(report.reproduced ? 1 : 0);
}

main().catch((e) => {
  log(`FATAL ${e.stack || e}`);
  process.exit(1);
});
