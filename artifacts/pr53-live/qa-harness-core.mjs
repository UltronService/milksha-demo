import { chromium } from 'playwright';
import {
  collectFrame,
  installBoardMutationWatcher,
  checkFrame,
  classifyKnown,
  medianIntervalMs,
} from './midframe-stub.mjs';
import {
  ensureCloudRunning,
  resetCloudState,
  startSite,
  stopHarness,
  PORT_SITE,
  installBundledCloudRouteShim,
} from '../../tests/e2e/harness.mjs';
import { FAKE_CLOUD_POS_SIGN_SECRET } from '../../tools/fake-cloud/sign-secret.mjs';

export const PAGE_SIZE = 10;

export function expectedPageSet(sentAsc, pageIndex) {
  const newestFirst = sentAsc.slice().reverse();
  const start = pageIndex * PAGE_SIZE;
  return new Set(newestFirst.slice(start, start + PAGE_SIZE));
}

export function setsEqual(a, b) {
  if (a.size !== b.size) {
    return false;
  }
  for (const x of a) {
    if (!b.has(x)) {
      return false;
    }
  }
  return true;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function LEGACY_SEED() {
  if (localStorage.getItem('__pr53_legacy')) {
    return;
  }
  localStorage.setItem('__pr53_legacy', '1');
  localStorage.setItem('milksha:deviceId', 'stb-old-99');
  localStorage.setItem('milksha:local:poc-target', JSON.stringify({ storeId: 's120030', deviceId: 'stb-01' }));
  localStorage.setItem('milksha:receiver-cache:s120030', JSON.stringify({ seq: 1, numberContent: [] }));
  localStorage.setItem('milksha:auth:legacy:zz:device:stb-01', JSON.stringify({ idToken: 'stale' }));
}

export function boardUrls(store = 's120030', device = 'stb-01') {
  const base = `http://127.0.0.1:${PORT_SITE}`;
  return {
    board: `${base}/?mode=cloud&store=${store}&device=${device}`,
    ctrl: `${base}/controller/?mode=cloud&store=${store}`,
  };
}

async function expandZone(ctrl, id) {
  await ctrl.evaluate((sid) => {
    const s = document.getElementById(sid);
    s?.querySelector('.zone-toggle')?.setAttribute('aria-expanded', 'true');
    const b = s?.querySelector('.zone-body');
    if (b) {
      b.hidden = false;
    }
  }, id);
}

async function ensureControllerSecrets(ctrl) {
  await expandZone(ctrl, 'sec-connect');
  await ctrl.evaluate((posSecret) => {
    const el = document.getElementById('fld-pos-sign-key');
    if (el) {
      el.value = posSecret;
    }
    if (window.QMS?.Transport?.ControllerSecrets) {
      window.QMS.Transport.ControllerSecrets.savePosSignSecret(posSecret);
    }
    const adv = document.getElementById('advanced-settings');
    if (adv) {
      adv.open = true;
    }
  }, FAKE_CLOUD_POS_SIGN_SECRET);
  await ctrl.click('#btn-connect').catch(() => {});
}

async function waitOnline(board, ctrl) {
  await ensureControllerSecrets(ctrl);
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  await ctrl.waitForSelector('#online-state[data-board-online="1"]', { timeout: 180000 });
  await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
  await installBoardMutationWatcher(board);
}

async function clearNow(ctrl, board) {
  await expandZone(ctrl, 'sec-special');
  await ctrl.click('[data-testid="btn-clear-now"]');
  await ctrl.click('[data-testid="btn-sim-stop"]').catch(() => {});
  await board.waitForTimeout(4000);
  await board.waitForFunction(() => document.querySelectorAll('.milksha-board-chip').length === 0, undefined, {
    timeout: 120000,
  });
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
      ({ z, n }) => [...document.querySelectorAll(`.milksha-zone.${z} .milksha-num`)].some((el) => el.textContent.trim() === n),
      { z: zn, n: no },
      { timeout: 15000 },
    )
    .catch(() => {});
  return Date.now() - t0;
}

async function zoneNumbersSettled(board, zone) {
  return board.evaluate((z) => {
    const layer = document.querySelector(`.milksha-zone.${z} .milksha-zone-numbers`);
    if (!layer) {
      return false;
    }
    const o = Number.parseFloat(getComputedStyle(layer).opacity);
    return o >= 0.99;
  }, zone);
}

async function readBoardPage(board) {
  return board.evaluate(() => {
    function zone(z) {
      const root = document.querySelector(`.milksha-zone.${z}`);
      const ind = root?.querySelector('.milksha-pg-indicator')?.textContent?.trim() || '';
      const nums = [...root.querySelectorAll('.milksha-num')].map((n) => n.textContent.trim()).filter(Boolean);
      const m = ind.match(/^(\d+)\/(\d+)$/);
      return {
        indicator: ind,
        page: m ? Number.parseInt(m[1], 10) - 1 : 0,
        pages: m ? Number.parseInt(m[2], 10) : 1,
        nums,
      };
    }
    return { prep: zone('prep'), ready: zone('ready') };
  });
}

/** Slot-ordered expected page (matches board-page-turn-desync e2e). */
export async function readBoardPageCorrected(board, sentByZone) {
  return board.evaluate(({ prepSent, readySent }) => {
    const rt = window.QMS?.runtime;
    const snap = rt?.getSnapshot?.();
    function scoreZone(z, sentAsc, snapItems) {
      const root = document.querySelector(`.milksha-zone.${z}`);
      const ind = root?.querySelector('.milksha-pg-indicator')?.textContent?.trim() || '';
      const m = ind.match(/^(\d+)\/(\d+)$/);
      if (!m) {
        return { ok: true, skipped: true };
      }
      const pageIndex = Number.parseInt(m[1], 10) - 1;
      const pageSize = 10;
      const start = pageIndex * pageSize;
      let expected;
      if (snapItems && Array.isArray(snapItems)) {
        expected = snapItems.slice(start, start + pageSize).map((it) => String(it.number));
      } else {
        const newestFirst = sentAsc.slice().reverse();
        expected = newestFirst.slice(start, start + pageSize);
      }
      const dom = [...root.querySelectorAll('.milksha-num-cell .milksha-num')].map((e) => e.textContent.trim());
      let ok = true;
      for (let i = 0; i < pageSize; i += 1) {
        if ((expected[i] || '') !== (dom[i] || '')) {
          ok = false;
        }
      }
      return { ok, indicator: ind, expected: expected.filter(Boolean), dom: dom.filter(Boolean) };
    }
    return {
      prep: scoreZone('prep', prepSent, snap?.preparing),
      ready: scoreZone('ready', readySent, snap?.ready),
    };
  }, sentByZone);
}

async function scanPageTurnFrames(board, label, durationMs = 800) {
  const prevByKey = new Map();
  const newIssues = [];
  const knownCounts = {};
  const times = [];
  const t0 = Date.now();
  let frame = 0;
  while (Date.now() - t0 < durationMs) {
    const scheduled = t0 + frame * 50;
    const w = scheduled - Date.now();
    if (w > 0) {
      await sleep(w);
    }
    times.push(Date.now());
    const tMs = Date.now() - t0;
    const state = await collectFrame(board);
    const issues = checkFrame(state, prevByKey, tMs);
    for (const iss of issues) {
      const labelK = classifyKnown(iss, 'page-turn', {});
      if (labelK) {
        knownCounts[labelK] = (knownCounts[labelK] || 0) + 1;
      } else {
        newIssues.push({ label, tMs, check: iss.check, nums: iss.num ? [iss.num] : iss.nums || [] });
      }
    }
    frame += 1;
  }
  return { newIssues, knownCounts, frameCount: frame, medianMs: medianIntervalMs(times) };
}

export async function mainFlow(browser, vp, legacy, urls) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  if (legacy) {
    await ctx.addInitScript(LEGACY_SEED);
  }
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await installBundledCloudRouteShim(board);
  await installBundledCloudRouteShim(ctrl);
  await board.goto(urls.board, { waitUntil: 'load' });
  await ctrl.goto(urls.ctrl, { waitUntil: 'load' });
  await waitOnline(board, ctrl);
  await clearNow(ctrl, board);
  const latencies = [];
  for (let i = 0; i < 11; i += 1) {
    latencies.push(await addTicket(ctrl, board, 'preparing', String(5100 + i), 'prep'));
  }
  for (let i = 0; i < 11; i += 1) {
    latencies.push(await addTicket(ctrl, board, 'ready', String(6100 + i), 'ready'));
  }
  await board.waitForTimeout(3500);
  const page = await readBoardPage(board);
  await clearNow(ctrl, board);
  await ctx.close();
  return {
    tag: `${legacy ? 'legacy' : 'fresh'}-${vp.tag}`,
    resolution: `${vp.w}x${vp.h}`,
    page,
    latencies,
    latOver3Count: latencies.filter((ms) => ms > 3000).length,
    latMax: latencies.length ? Math.max(...latencies) : 0,
  };
}

export async function pageTurnDesync(browser, vp, urls, options = {}) {
  const scoring = options.scoring || 'qa-set';
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await installBundledCloudRouteShim(board);
  await installBundledCloudRouteShim(ctrl);
  await board.goto(urls.board);
  await ctrl.goto(urls.ctrl);
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
  const pageMismatch = [];
  const pageMismatchCorrected = [];
  const missingOver3s = [];
  const midFrames = [];
  for (let c = 0; c < 10; c += 1) {
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
    const scan = await scanPageTurnFrames(board, `cycle-${c}`, 800);
    midFrames.push(scan);
    for (let p = 0; p < 13; p += 1) {
      await board.waitForTimeout(500);
      const snap = await readBoardPage(board);
      for (const z of ['prep', 'ready']) {
        const sent = z === 'prep' ? prepSent : readySent;
        const st = snap[z];
        if (st.pages <= 1 || st.nums.length === 0) {
          continue;
        }
        if (!(await zoneNumbersSettled(board, z))) {
          continue;
        }
        if (scoring === 'qa-set' || scoring === 'both') {
          const exp = expectedPageSet(sent, st.page);
          const vis = new Set(st.nums);
          if (!setsEqual(exp, vis)) {
            pageMismatch.push({
              cycle: c,
              zone: z,
              indicator: st.indicator,
              expected: [...exp],
              visible: [...vis],
            });
          }
        }
      }
      if (scoring === 'corrected' || scoring === 'both') {
        const corr = await readBoardPageCorrected(board, { prepSent, readySent });
        for (const z of ['prep', 'ready']) {
          const row = corr[z];
          if (row.skipped || row.ok) {
            continue;
          }
          pageMismatchCorrected.push({ cycle: c, zone: z, ...row });
        }
      }
    }
    if (midAppearMs === null || midAppearMs > 3000) {
      missingOver3s.push({ cycle: c, num: midNo, sentAt: midSentAt, appearMs: midAppearMs });
    }
  }
  await clearNow(ctrl, board);
  await ctx.close();
  const midNew = midFrames.flatMap((f) => f.newIssues);
  return {
    cycles: 10,
    pageMismatchEvents: pageMismatch.length,
    pageMismatchUniqueCycles: new Set(pageMismatch.map((m) => `${m.cycle}-${m.zone}`)).size,
    pageMismatchSamples: pageMismatch.slice(0, 5),
    pageMismatchCorrectedEvents: pageMismatchCorrected.length,
    pageMismatchCorrectedSamples: pageMismatchCorrected.slice(0, 5),
    missingOver3sCount: missingOver3s.length,
    missingOver3s,
    midNewCount: midNew.length,
  };
}

export async function runFullSuite(commitLabel) {
  await ensureCloudRunning();
  await resetCloudState({ seedDevice: true });
  await startSite();
  const urls = boardUrls();
  const browser = await chromium.launch({ headless: true });
  const mainFlows = [];
  for (const vp of [
    { w: 1920, h: 1080, tag: '1080' },
    { w: 3840, h: 2160, tag: '4k' },
  ]) {
    mainFlows.push(await mainFlow(browser, vp, false, urls));
    mainFlows.push(await mainFlow(browser, vp, true, urls));
  }
  const desync1080 = await pageTurnDesync(browser, { w: 1920, h: 1080, tag: '1080' }, urls, { scoring: 'both' });
  const desync4k = await pageTurnDesync(browser, { w: 3840, h: 2160, tag: '4k' }, urls, { scoring: 'both' });
  await browser.close();
  return { commit: commitLabel, mainFlows, pageTurnDesync: { '1080': desync1080, '4k': desync4k } };
}

export async function prepareSiteRootForCommit(commit, workspaceRoot) {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { execSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  stopHarness();
  const dir = mkdtempSync(join(tmpdir(), `milksha-${commit.slice(0, 7)}-`));
  execSync(`git archive ${commit} | tar -x -C "${dir}"`, {
    cwd: workspaceRoot,
    stdio: 'pipe',
  });
  process.env.MILKSHA_SITE_ROOT = dir;
  await ensureCloudRunning();
  await startSite();
  return {
    dir,
    cleanup() {
      stopHarness();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}
