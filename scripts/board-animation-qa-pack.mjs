#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { collectPerfMetrics } from './board-animation-perf-metrics.mjs';
import { buildAllContactSheets } from './board-animation-contact-sheets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-animation-self-qa');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);
const STORE = 'zz-qa-store-a';

function gitArchiveMain() {
  const dir = join(tmpdir(), 'milksha-board-anim-main-qa');
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  execSync('git archive main | tar -x -C "' + dir + '"', { cwd: ROOT, stdio: 'ignore' });
  return dir;
}

function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) {
    return null;
  }
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function domToOpacityDelayMs(events) {
  const byId = {};
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i];
    const id = e.detail && e.detail.id;
    if (!id) {
      continue;
    }
    if (e.event === 'chip-dom') {
      byId[id] = { dom: e.t };
    }
    if (e.event === 'opacity-anim-start' && byId[id] && byId[id].dom) {
      byId[id].opacity = e.t;
    }
  }
  const deltas = [];
  for (const id of Object.keys(byId)) {
    if (byId[id].dom && byId[id].opacity) {
      deltas.push(byId[id].opacity - byId[id].dom);
    }
  }
  if (!deltas.length) {
    return null;
  }
  return Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100;
}

async function measureFakeCloudLatency(siteRoot, label) {
  const { spawn } = await import('node:child_process');
  const { installBundledCloudRouteShim, resetCloudState, startSite, stopSite } = await import(
    '../tests/e2e/harness.mjs',
  );
  if (siteRoot !== ROOT) {
    process.env.MILKSHA_SITE_ROOT = siteRoot;
    stopSite();
    await startSite();
  }
  const cloudPort = Number(process.env.FAKE_CLOUD_PORT || 8787);
  const cloud = spawn(process.execPath, [join(siteRoot, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(cloudPort) },
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await installBundledCloudRouteShim(board);
  await installBundledCloudRouteShim(ctrl);
  const samples = [];
  try {
    await resetCloudState({ seedDevice: true });
    await board.goto(`http://127.0.0.1:${PORT}/?mode=cloud&store=${STORE}`);
    await ctrl.goto(`http://127.0.0.1:${PORT}/controller/?mode=cloud&store=${STORE}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    for (let i = 0; i < 10; i += 1) {
      await board.evaluate(() => {
        window.QMS.runtime.clearPerfEvents?.();
        window.__milkshaBoardPerfEvents = [];
      });
      const t0 = Date.now();
      await ctrl.click('[data-testid="btn-send-numbers"]');
      await board.waitForFunction(
        (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
        i + 1,
        { timeout: 3000 },
      );
      const tVisible = Date.now() - t0;
      const extra = await board.evaluate(() => {
        const events = window.QMS.runtime.getPerfEvents?.() || window.__milkshaBoardPerfEvents || [];
        const chips = [...document.querySelectorAll('.milksha-ready .milksha-board-chip')];
        const last = chips[chips.length - 1];
        return {
          events: events,
          chipId: last ? last.getAttribute('data-item-id') : null,
        };
      });
      const domOpacityMs = domToOpacityDelayMs(extra.events);
      samples.push({
        index: i + 1,
        clickToReadyNumberVisibleMs: tVisible,
        domToOpacityAnimStartMs: domOpacityMs,
      });
    }
  } finally {
    await ctx.close();
    await browser.close();
    cloud.kill('SIGTERM');
  }
  const vis = samples.map((s) => s.clickToReadyNumberVisibleMs);
  return {
    label: label,
    methodology: {
      clickToReadyNumberVisibleMs:
        '控制端 click [data-testid=btn-send-numbers] → 看板 .milksha-ready .milksha-num 數量達標（含假雲端輪詢／推送路徑）',
      domToOpacityAnimStartMs:
        '同一送號：perf chip-dom → opacity-anim-start 時間差（證明動態不延後進 DOM，僅在 DOM 後啟動 opacity）',
      note:
        '中位 ~500ms 常見於假雲端 board 輪詢間隔（約 500ms）；與動畫無關。dom→opacity 應接近 0ms。',
    },
    medianClickToVisibleMs: median(vis),
    maxClickToVisibleMs: Math.max(...vis),
    samples: samples,
  };
}

async function measureLiveCloud() {
  const { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } = await import(
    '../tests/e2e/board-animation-live-setup.mjs'
  );
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(180000);
  await installLiveBranchCloudRoutes(ctx);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await board.goto(`${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=stb-01`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 180000 });
  await ctrlNav;
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    const t0 = Date.now();
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
      i + 1,
      { timeout: 3000 },
    );
    samples.push({ index: i + 1, clickToReadyNumberVisibleMs: Date.now() - t0 });
    await board.waitForTimeout(120);
  }
  await browser.close();
  return {
    store: STORE,
    route: 'ultronservice.github.io/milksha-demo + installGithubPagesSiteRoute(branch)',
    samples: samples,
    maxMs: Math.max(...samples.map((s) => s.clickToReadyNumberVisibleMs)),
    medianMs: median(samples.map((s) => s.clickToReadyNumberVisibleMs)),
  };
}

function runFullE2eSummary() {
  const logPath = join(ART, 'e2e-full-latest.log');
  const res = spawnSync('npm', ['run', 'test:e2e'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  writeFileSync(logPath, (res.stdout || '') + (res.stderr || ''));
  const text = res.stdout || '';
  const m = text.match(/(\d+)\s+passed(?:.*?(\d+)\s+failed)?/);
  const skipped = text.match(/(\d+)\s+skipped/);
  return {
    exitCode: res.status,
    logPath: logPath,
    passed: m ? Number(m[1]) : null,
    failed: m && m[2] ? Number(m[2]) : 0,
    skipped: skipped ? Number(skipped[1]) : 0,
    rawTail: text.split('\n').slice(-8).join('\n'),
  };
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const head = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  const perf = await collectPerfMetrics();
  const contactSheets = await buildAllContactSheets();
  const branchFake = await measureFakeCloudLatency(ROOT, 'branch');
  const mainRoot = gitArchiveMain();
  let mainFake = null;
  if (process.env.PERF_SKIP_MAIN !== '1') {
    mainFake = await measureFakeCloudLatency(mainRoot, 'main');
  }
  const liveCloud = await measureLiveCloud();
  const e2e =
    process.env.SKIP_FULL_E2E === '1'
      ? { skipped: true, note: 'Set SKIP_FULL_E2E=0 to run npm run test:e2e' }
      : runFullE2eSummary();
  let contactBytes = 0;
  for (const p of contactSheets) {
    if (existsSync(p)) {
      contactBytes += statSync(p).size;
    }
  }
  const metrics = {
    head,
    generatedAt: new Date().toISOString(),
    perfCpu4x: perf,
    fakeCloudLatency: { branch: branchFake, main: mainFake },
    liveCloud,
    contactSheets: contactSheets.map((p) => p.replace(ROOT + '/', '')),
    contactSheetsTotalBytes: contactBytes,
    e2eFull: e2e,
    skipAnimationRules: {
      firstPayload: 'boot 後第一次 applyPayload',
      silentReconnect: 'applyPayload(..., { silent: true }) 重連整份 snapshot',
      snapshotReloadFlag: 'applyPayload(..., { forceSnapshotSkip: true }) 明確整份重載（測試／未來擴充）',
      removedBulkRatioPrimary:
        '已移除以交集比例猜測 snapshot；正常 onSnapshot 尖峰（如一次 3 單）仍 animate。',
    },
  };
  writeFileSync(join(ART, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify({ head, e2e: e2e, liveCloud: liveCloud }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
