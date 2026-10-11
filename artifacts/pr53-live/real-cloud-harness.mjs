import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installGithubPagesSiteRoute, GITHUB_PAGES_BASE } from '../../scripts/lib/github-pages-site-route.mjs';
import { ensurePublicFirebaseJs } from '../../tests/e2e/board-animation-live-setup.mjs';
import { LIVE_CLOUD_BOARD_DEVICE, LIVE_CLOUD_STORE_ID } from '../../tests/e2e/live-cloud-config.mjs';
import { teardownLiveCloudSession } from '../../tests/e2e/live-cloud-teardown.mjs';
import { expandControllerZone } from '../../tests/e2e/harness.mjs';
import { DIAG_INIT_SCRIPT, drainDiagRound } from './diag-instrumentation.mjs';
import { scoreSettledFrame } from './score-settled-frame.mjs';

const CYCLES = Number(process.env.PR53_LIVE_CYCLES || 30);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function publicUrls(store = LIVE_CLOUD_STORE_ID, device = LIVE_CLOUD_BOARD_DEVICE) {
  return {
    board: `${GITHUB_PAGES_BASE}/?mode=cloud&store=${store}&device=${device}`,
    ctrl: `${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${store}`,
  };
}

async function installRealCloudRoutes(ctx, siteRoot) {
  const pubJs = await ensurePublicFirebaseJs();
  await installGithubPagesSiteRoute(ctx, siteRoot);
  await ctx.route('**/config/firebase.js*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: pubJs,
    });
  });
  await ctx.addInitScript(DIAG_INIT_SCRIPT);
  await ctx.addInitScript(() => {
    window.__rcvMatrixTimeline = [];
    try {
      const cfg = window.MILKSHA_FIREBASE_CONFIG || {};
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: cfg.projectId || 'milksha-qms-dev',
          apiKey: cfg.apiKey || '',
          region: cfg.region || 'asia-east1',
        }),
      );
    } catch {
      /* ignore */
    }
  });
}

async function expandZone(ctrl, id) {
  await expandControllerZone(ctrl, id);
}

async function waitOnline(board, ctrl) {
  const ctrlNav = ctrl.goto(publicUrls().ctrl, { waitUntil: 'load' });
  await board.goto(publicUrls().board, { waitUntil: 'load' });
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
  await ctrlNav;
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  await ctrl.waitForSelector('#online-state[data-board-online="1"]', { timeout: 180000 });
}

async function clearNow(ctrl, board) {
  await expandZone(ctrl, 'sec-special');
  await ctrl.click('[data-testid="btn-clear-now"]');
  await ctrl.click('[data-testid="btn-sim-stop"]').catch(() => {});
  await board.waitForTimeout(4000);
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-board-chip').length === 0,
    undefined,
    { timeout: 120000 },
  );
}

async function fireTicket(ctrl, status, no) {
  await expandZone(ctrl, 'sec-pos');
  await ctrl.selectOption('[data-testid="fld-status"]', status);
  await ctrl.fill('[data-testid="fld-no"]', no);
  await ctrl.click('[data-testid="btn-add-ticket"]');
}

async function addTicket(ctrl, board, status, no, zone) {
  const t0 = Date.now();
  await fireTicket(ctrl, status, no);
  const zn = zone || (status === 'ready' ? 'ready' : 'prep');
  await board
    .waitForFunction(
      ({ z, n }) =>
        [...document.querySelectorAll(`.milksha-zone.${z} .milksha-num`)].some((el) => el.textContent.trim() === n),
      { z: zn, n: no },
      { timeout: 15000 },
    )
    .catch(() => {});
  return Date.now() - t0;
}

async function sampleDomFrame(board) {
  return board.evaluate(() => {
    function zdom(z) {
      const root = document.querySelector(`.milksha-zone.${z}`);
      return {
        ind: root?.querySelector('.milksha-pg-indicator')?.textContent?.trim() || '',
        loose: [...(root?.querySelectorAll('.milksha-num') ?? [])].map((e) => e.textContent.trim()).filter(Boolean),
        slots: [...(root?.querySelectorAll('.milksha-num-cell .milksha-num') ?? [])].map((e) => e.textContent.trim()),
      };
    }
    return { t: Date.now(), prep: zdom('prep'), ready: zdom('ready') };
  });
}

/**
 * @param {string} siteRoot
 * @param {{ w: number, h: number; tag: string }} vp
 * @param {string} commitSha
 */
export async function runRealCloudPageTurn(siteRoot, vp, commitSha) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  ctx.setDefaultTimeout(180000);
  await installRealCloudRoutes(ctx, siteRoot);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await waitOnline(board, ctrl);
  await clearNow(ctrl, board);

  const prepSent = [];
  const readySent = [];
  for (let i = 0; i < 12; i += 1) {
    const n = String(7100 + i);
    prepSent.push(n);
    await addTicket(ctrl, board, 'preparing', n, 'prep');
  }
  for (let i = 0; i < 12; i += 1) {
    const n = String(8100 + i);
    readySent.push(n);
    await addTicket(ctrl, board, 'ready', n, 'ready');
  }

  const roundSummaries = [];
  let qaSetMismatchEvents = 0;
  let slotMismatchEvents = 0;
  let lastPageTenOldEvents = 0;
  let missingOver3sCount = 0;
  let crossZoneRoundCount = 0;
  let applyPayloadTotal = 0;

  for (let c = 0; c < CYCLES; c += 1) {
    const roundT0 = Date.now();
    await board.waitForTimeout(5200);
    const midNo = String(7200 + c);
    prepSent.push(midNo);
    const midSentAt = Date.now();
    await fireTicket(ctrl, 'preparing', midNo);
    const midAppearMs = await board
      .waitForFunction(
        (n) =>
          [...document.querySelectorAll('.milksha-zone.prep .milksha-num')].some((el) => el.textContent.trim() === n),
        midNo,
        { timeout: 3000 },
      )
      .then(() => Date.now() - midSentAt)
      .catch(() => null);

    const midFrames = [];
    const midT0 = Date.now();
    for (let f = 0; f < 17; f += 1) {
      const scheduled = midT0 + f * 50;
      const w = scheduled - Date.now();
      if (w > 0) {
        await sleep(w);
      }
      midFrames.push(await sampleDomFrame(board));
    }

    let prevIndicators = { prep: '', ready: '' };
    let roundCross = [];
    let roundQaSet = 0;
    let roundSlot = 0;
    let roundTenOld = 0;

    for (let p = 0; p < 13; p += 1) {
      await board.waitForTimeout(500);
      const scored = await scoreSettledFrame(board, { prepSent, readySent, prevIndicators });
      prevIndicators = scored.nextPrevIndicators;
      if (scored.prepInReady.length > 0) {
        roundCross.push(...scored.prepInReady);
      }
      for (const zKey of ['prep', 'ready']) {
        const row = scored[zKey];
        if (row.skipped) {
          continue;
        }
        if (!row.qaSetOk) {
          roundQaSet += 1;
          qaSetMismatchEvents += 1;
        }
        if (!row.slotOk) {
          roundSlot += 1;
          slotMismatchEvents += 1;
        }
        if (row.lastPageTenOld) {
          roundTenOld += 1;
          lastPageTenOldEvents += 1;
        }
      }
    }

    const diag = await drainDiagRound(board);
    applyPayloadTotal += diag.applyPayloadCount;

    const crossUnique = [...new Set(roundCross)];
    if (crossUnique.length > 0) {
      crossZoneRoundCount += 1;
    }
    if (midAppearMs === null || midAppearMs > 3000) {
      missingOver3sCount += 1;
    }

    const keepMidFrames = crossUnique.length > 0 || roundQaSet > 0 || roundSlot > 0;
    roundSummaries.push({
      cycle: c,
      midNo,
      midAppearMs,
      qaSetMismatchSamples: roundQaSet,
      slotMismatchSamples: roundSlot,
      lastPageTenOldSamples: roundTenOld,
      prepInReady: crossUnique,
      applyPayloadCount: diag.applyPayloadCount,
      receiveBoardCount: diag.receiveBoardCount,
      boardSnapshotEvents: diag.boardSnapshotEvents,
      durationMs: Date.now() - roundT0,
      midFrames: keepMidFrames ? midFrames : undefined,
    });
  }

  try {
    await teardownLiveCloudSession(ctrl, board);
  } finally {
    await browser.close();
  }

  return {
    commit: commitSha,
    store: LIVE_CLOUD_STORE_ID,
    viewport: `${vp.w}x${vp.h}`,
    cycles: CYCLES,
    qaSetMismatchEvents,
    slotMismatchEvents,
    lastPageTenOldEvents,
    missingOver3sCount,
    crossZoneRoundCount,
    applyPayloadTotal,
    applyPayloadAvgPerRound: applyPayloadTotal / CYCLES,
    roundSummaries,
  };
}

export function summarizeRealCloudResult(r) {
  return {
    qaSetMismatchEvents: r.qaSetMismatchEvents,
    slotMismatchEvents: r.slotMismatchEvents,
    lastPageTenOldEvents: r.lastPageTenOldEvents,
    missingOver3sCount: r.missingOver3sCount,
    crossZoneRoundCount: r.crossZoneRoundCount,
    applyPayloadAvgPerRound: r.applyPayloadAvgPerRound,
  };
}

export function buildCompareTable(before1080, after1080, before4k, after4k) {
  const metricKeys = [
    'qaSetMismatchEvents',
    'slotMismatchEvents',
    'lastPageTenOldEvents',
    'missingOver3sCount',
    'crossZoneRoundCount',
    'applyPayloadAvgPerRound',
  ];
  const table = {};
  let anyWorse = false;
  for (const suffix of ['1080', '4k']) {
    const b = suffix === '1080' ? before1080 : before4k;
    const a = suffix === '1080' ? after1080 : after4k;
    for (const mk of metricKeys) {
      const key = `${mk}${suffix === '1080' ? '1080' : '4k'}`;
      const bv = b[mk];
      const av = a[mk];
      let verdict = 'not fixed';
      if (typeof bv === 'number' && typeof av === 'number') {
        if (av > bv) {
          verdict = 'WORSE';
          anyWorse = true;
        } else if (av < bv) {
          verdict = 'better';
        }
      }
      table[key] = { before: bv, after: av, verdict };
    }
  }
  return { anyWorse, table, cycles: CYCLES };
}

export async function extractCommitSiteRoot(commit, workspaceRoot) {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { execSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), `milksha-rc-${commit.slice(0, 7)}-`));
  execSync(`git archive ${commit} | tar -x -C "${dir}"`, { cwd: workspaceRoot, stdio: 'pipe' });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function writeRealCloudArtifacts(artDir, payload) {
  mkdirSync(artDir, { recursive: true });
  writeFileSync(join(artDir, payload.fileName), JSON.stringify(payload.body, null, 2));
}
