#!/usr/bin/env node
/**
 * Board boot timeline — public Pages only. No API keys in output.
 */
import { chromium, firefox } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { GITHUB_PAGES_BASE } from './lib/github-pages-site-route.mjs';
import { CONTROLLER_BOARD_ONLINE_WAIT_JS } from './lib/controller-board-online.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'boot-timeline-measure');
const STORE = 'zz-qa-store-a';
const DEVICE = 'stb-01';
const ROUNDS = Number(process.env.MILKSHA_TIMELINE_ROUNDS || 3);
const MEASURE_SHA = process.env.MILKSHA_MEASURE_SHA || 'c8d8174ceb4f1909111cbd6d9e1bd3170b32cf9f';

function boardUrl() {
  const u = new URL(`${GITHUB_PAGES_BASE}/`);
  u.searchParams.set('mode', 'cloud');
  u.searchParams.set('store', STORE);
  u.searchParams.set('device', DEVICE);
  return u.toString();
}

let cachedPubFirebaseJs = '';

async function ensurePubFirebaseJs() {
  if (!cachedPubFirebaseJs) {
    const res = await fetch(`${GITHUB_PAGES_BASE}/config/firebase.js`, { cache: 'no-store' });
    cachedPubFirebaseJs = await res.text();
  }
  return cachedPubFirebaseJs;
}

function median(nums) {
  const arr = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!arr.length) {
    return null;
  }
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 0) {
    return Math.round((arr[mid - 1] + arr[mid]) / 2);
  }
  return arr[mid];
}

function max(nums) {
  const arr = nums.filter((n) => Number.isFinite(n));
  return arr.length ? Math.max(...arr) : null;
}

function summarizeRuns(runs, stepKeys) {
  const out = {};
  for (const key of stepKeys) {
    out[key] = {
      median: median(runs.map((r) => r.steps[key]?.cumMs)),
      max: max(runs.map((r) => r.steps[key]?.cumMs)),
      durMedian: median(runs.map((r) => r.steps[key]?.durMs)),
      durMax: max(runs.map((r) => r.steps[key]?.durMs)),
    };
  }
  return out;
}

async function attachBoardInstrumentation(page, profileMode) {
  const pubJs = await ensurePubFirebaseJs();
  await page.addInitScript(
    ({ body, mode }) => {
      // Public firebase config (no secrets in repo artifact).
      // eslint-disable-next-line no-eval
      eval(body);
      window.__rcvMatrixTimeline = [];
      try {
        if (mode === 'fresh') {
          for (const k of Object.keys(localStorage)) {
            if (k.indexOf('milksha:auth:') === 0) {
              localStorage.removeItem(k);
            }
          }
        }
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
    },
    { body: pubJs, mode: profileMode },
  );
}

async function runOneRound(board, ctrl, roundLabel) {
  const netLog = {
    devLoginCount: 0,
    devLoginTimings: [],
    signInCustomTokenCount: 0,
    readBoardCount: 0,
    firstReadBoardAt: null,
    heartbeatSendAt: null,
    heartbeatOkAt: null,
  };

  let devLoginReqAt = null;
  const onBoard = (req) => {
    const u = req.url();
    if (u.includes('devLogin') && req.method() === 'POST') {
      netLog.devLoginCount += 1;
      devLoginReqAt = Date.now();
      netLog.devLoginHttpAt = devLoginReqAt;
    }
  };
  const onBoardRes = async (res) => {
    const u = res.url();
    const req = res.request();
    if (u.includes('devLogin') && req.method() === 'POST') {
      const end = Date.now();
      const start = devLoginReqAt || end;
      netLog.devLoginHttpEndAt = end;
      netLog.devLoginTimings.push({ wallTotalMs: end - start, status: res.status() });
    }
    if (u.includes('signInWithCustomToken') && req.method() === 'POST') {
      netLog.signInCustomTokenCount += 1;
    }
    if ((u.includes('readBoard') || u.includes('today_board') || u.includes('getBoard')) && res.ok()) {
      netLog.readBoardCount += 1;
      if (!netLog.firstReadBoardAt) {
        netLog.firstReadBoardAt = Date.now();
      }
    }
    if (u.includes('boxHeartbeat') && req.method() === 'POST') {
      if (!netLog.heartbeatSendAt) {
        netLog.heartbeatSendAt = Date.now();
      }
      if (res.ok() && !netLog.heartbeatOkAt) {
        netLog.heartbeatOkAt = Date.now();
      }
    }
  };

  board.on('request', onBoard);
  board.on('response', onBoardRes);

  const t0 = Date.now();
  const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);

  const navResponse = await board.goto(boardUrl(), { waitUntil: 'commit' });
  const tNav = t0;

  await board.waitForLoadState('load', { timeout: 120000 }).catch(() => {});

  const perfNav = await board.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav) {
      return { domContentLoaded: null, load: null };
    }
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
    };
  });

  const tStoreKnown = await board
    .waitForFunction(
      () => {
        const p = new URLSearchParams(location.search);
        return p.get('store') === 'zz-qa-store-a' && Boolean(window.receiverCloud);
      },
      { timeout: 120000 },
    )
    .then(() => Date.now())
    .catch(() => null);

  const authEvents = await waitAuthTimeline(board, tNav, 90000);
  const firstNumbersAt = await board
    .waitForFunction(
      () => {
        if (document.querySelectorAll('.milksha-ready .milksha-num').length > 0) {
          return true;
        }
        const seq = window.receiverCloud?.getLocalSeq?.();
        return typeof seq === 'number' && seq > 0;
      },
      { timeout: 60000 },
    )
    .then(() => Date.now())
    .catch(() => null);

  const resourceDevLogin = await board.evaluate(() => {
    const entries = performance.getEntriesByType('resource');
    const hit = entries.find((e) => e.name && e.name.includes('devLogin'));
    if (!hit) {
      return null;
    }
    return {
      ttfbMs: Math.round(hit.responseStart - hit.requestStart),
      downloadMs: Math.round(hit.responseEnd - hit.responseStart),
      totalMs: Math.round(hit.responseEnd - hit.requestStart),
      connectMs: hit.connectEnd > 0 ? Math.round(hit.connectEnd - hit.connectStart) : null,
    };
  });

  const listenAt = await waitTimelineKinds(board, tNav, ['board_listen_attached', 'control_listen_attached'], 60000);

  await ctrlNav;
  const tCtrlOnline = await ctrl
    .waitForFunction(CONTROLLER_BOARD_ONLINE_WAIT_JS, { timeout: 120000 })
    .then(() => Date.now())
    .catch(() => null);

  const timeline = await board.evaluate(() => window.__rcvMatrixTimeline || []);
  const stats = await board.evaluate(() => {
    const rc = window.receiverCloud;
    return rc && rc.getRealtimeStats ? rc.getRealtimeStats() : {};
  });

  board.off('request', onBoard);
  board.off('response', onBoardRes);

  const cum = (ts) => (ts != null ? ts - tNav : null);
  const step = (cumMs, durMs, note) => ({ cumMs, durMs, note });

  let authNote = authEvents.authMode;
  if (netLog.devLoginCount > 0) {
    authNote = `新取（devLogin HTTP×${netLog.devLoginCount}；signIn×${netLog.signInCustomTokenCount}）`;
  } else if (netLog.devLoginCount === 0) {
    authNote = '沿用通行證（本導航無 devLogin HTTP）';
  }
  const devLoginWall = netLog.devLoginTimings[0]?.wallTotalMs ?? null;
  const devLoginTtfb = resourceDevLogin?.ttfbMs ?? null;
  const devLoginCloudEst =
    devLoginTtfb != null && resourceDevLogin?.connectMs != null
      ? Math.max(0, devLoginTtfb - resourceDevLogin.connectMs)
      : devLoginTtfb;

  const steps = {
    a_domContentLoaded: step(perfNav.domContentLoaded, perfNav.domContentLoaded, 'PerformanceNavigationTiming'),
    a_load: step(perfNav.load, perfNav.load != null && perfNav.domContentLoaded != null ? perfNav.load - perfNav.domContentLoaded : null, 'load event'),
    b_storeAndReceiver: step(cum(tStoreKnown), null, 'URL store + receiverCloud'),
    c_storeRegister: step(
      netLog.devLoginHttpAt ? cum(netLog.devLoginHttpAt) : null,
      netLog.devLoginTimings[0]?.wallTotalMs ?? null,
      netLog.devLoginCount
        ? '無獨立登記 API；等同 devLogin POST'
        : '本輪未發 devLogin（沿用通行證）',
    ),
    d_auth: step(cum(authEvents.authDoneAt), authEvents.authDurMs, authNote),
    d_devLogin_net: step(cum(netLog.devLoginHttpEndAt), devLoginWall, `HTTP 計數=${netLog.devLoginCount}`),
    d_devLogin_ttfb: step(
      cum(netLog.devLoginHttpEndAt),
      devLoginTtfb ?? devLoginWall,
      devLoginTtfb != null ? 'ResourceTiming TTFB' : '無 ResourceTiming 時用 wall 總時間',
    ),
    d_devLogin_cloudEst: step(
      cum(netLog.devLoginHttpEndAt),
      devLoginCloudEst ?? (devLoginWall && devLoginTtfb == null ? devLoginWall : devLoginCloudEst),
      'TTFB−connect；無法分離時 cloudEst≈wall',
    ),
    e_firstNumbers: step(cum(firstNumbersAt), null, '號碼 DOM 或 localSeq>0'),
    f_heartbeatSend: step(cum(netLog.heartbeatSendAt || authEvents.hbSendTs), null, 'boxHeartbeat POST'),
    f_heartbeatOk: step(cum(netLog.heartbeatOkAt || authEvents.hbOkTs), null, 'boxHeartbeat 2xx'),
    g_boardListen: step(cum(listenAt.board_listen_attached), null, 'timeline board_listen_attached'),
    g_controlListen: step(cum(listenAt.control_listen_attached), null, 'timeline control_listen_attached'),
    h_controllerBoardOnline: step(cum(tCtrlOnline), null, '#transport-route data-board-online'),
  };

  return {
    label: roundLabel,
    tNav,
    steps,
    meta: {
      devLoginCount: netLog.devLoginCount,
      signInCustomTokenCount: netLog.signInCustomTokenCount,
      authMode: authNote,
      readBoardCount: netLog.readBoardCount,
      commandMode: stats.commandMode,
      boardListen: stats.boardListen,
      timelineKinds: timeline.map((e) => e.kind),
    },
  };
}

async function waitTimelineKinds(board, since, kinds, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const found = {};
  while (Date.now() < deadline) {
    const rows = await board.evaluate(
      ({ s, ks }) => {
        const tl = window.__rcvMatrixTimeline || [];
        const out = {};
        for (const k of ks) {
          const row = tl.find((e) => e.kind === k && e.ts >= s);
          if (row) {
            out[k] = row.ts;
          }
        }
        return out;
      },
      { s: since, ks: kinds },
    );
    for (const k of kinds) {
      if (rows[k] && !found[k]) {
        found[k] = rows[k];
      }
    }
    if (kinds.every((k) => found[k])) {
      break;
    }
    await board.waitForTimeout(150);
  }
  return found;
}

async function waitAuthTimeline(board, since, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let authDoneAt = null;
  let authMode = 'pending';
  let devLoginHttpAt = null;
  let devLoginHttpEndAt = null;
  let hbSendTs = null;
  let hbOkTs = null;
  while (Date.now() < deadline) {
    const snap = await board.evaluate((s) => {
      const tl = window.__rcvMatrixTimeline || [];
      const cached = tl.find((e) => e.kind === 'auth_cached_token' && e.ts >= s);
      const devOk = tl.find((e) => e.kind === 'devlogin_complete' && e.ts >= s);
      const hbS = tl.find((e) => e.kind === 'heartbeat_send' && e.ts >= s);
      const hbO = tl.find((e) => e.kind === 'heartbeat_ok' && e.ts >= s);
      return {
        cachedTs: cached ? cached.ts : 0,
        devOkTs: devOk ? devOk.ts : 0,
        hbSend: hbS ? hbS.ts : 0,
        hbOk: hbO ? hbO.ts : 0,
      };
    }, since);
    if (snap.hbSend) {
      hbSendTs = snap.hbSend;
    }
    if (snap.hbOk) {
      hbOkTs = snap.hbOk;
    }
    if (snap.devOkTs > 0) {
      authDoneAt = snap.devOkTs;
      authMode = '新取（devlogin_complete＝devLogin HTTP + signInWithCustomToken）';
      break;
    }
    if (snap.cachedTs > 0) {
      authDoneAt = snap.cachedTs;
      authMode = '沿用快取 idToken（頁內未打 devLogin HTTP）';
      break;
    }
    await board.waitForTimeout(100);
  }
  return {
    authDoneAt,
    authMode,
    authDurMs: authDoneAt ? authDoneAt - since : null,
    devLoginHttpAt,
    devLoginHttpEndAt,
    hbSendTs,
    hbOkTs,
  };
}

async function runScenario(browserName, launcher, profileMode) {
  const browser = await launcher.launch({ headless: true });
  const runs = [];
  try {
    let warmCtx = null;
    for (let i = 1; i <= ROUNDS; i += 1) {
      const ctx =
        profileMode === 'fresh'
          ? await browser.newContext()
          : warmCtx || (warmCtx = await browser.newContext());
      const board = await ctx.newPage();
      const ctrl = await ctx.newPage();
      await attachBoardInstrumentation(board, profileMode);
      await attachBoardInstrumentation(ctrl, profileMode);
      const label = `${browserName}-${profileMode}-${i}`;
      runs.push(await runOneRound(board, ctrl, label));
      if (profileMode === 'fresh') {
        await ctx.close();
      } else {
        await board.close();
        await ctrl.close();
      }
    }
    if (warmCtx) {
      await warmCtx.close();
    }
  } finally {
    await browser.close();
  }
  return runs;
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const stepKeys = [
    'a_domContentLoaded',
    'a_load',
    'b_storeAndReceiver',
    'd_auth',
    'd_devLogin_ttfb',
    'd_devLogin_cloudEst',
    'e_firstNumbers',
    'f_heartbeatOk',
    'g_boardListen',
    'g_controlListen',
    'h_controllerBoardOnline',
  ];
  const report = {
    at: new Date().toISOString(),
    measureTarget: 'public-github-pages',
    mergedPr34Sha: MEASURE_SHA,
    pagesUrl: GITHUB_PAGES_BASE,
    store: STORE,
    rounds: ROUNDS,
    scenarios: {},
  };

  for (const { name, launcher } of [
    { name: 'chromium', launcher: chromium },
    { name: 'firefox', launcher: firefox },
  ]) {
    for (const profile of ['fresh', 'warm']) {
      const key = `${name}_${profile}`;
      report.scenarios[key] = {
        profile: profile === 'fresh' ? '全新 profile' : '舊設定（同 context 重開）',
        browser: name,
        runs: await runScenario(name, launcher, profile),
      };
      report.scenarios[key].summary = summarizeRuns(report.scenarios[key].runs, stepKeys);
      report.scenarios[key].devLoginCounts = report.scenarios[key].runs.map((r) => ({
        label: r.label,
        devLoginCount: r.meta.devLoginCount,
        authMode: r.meta.authMode,
      }));
    }
  }

  writeFileSync(join(ART, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, art: ART }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
