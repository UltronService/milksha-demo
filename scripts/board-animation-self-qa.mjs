#!/usr/bin/env node
/**
 * Board animation artifacts: burst screenshots, perf traces, fake-cloud latency vs main.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-animation-self-qa');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);
const STORE = 'zz-qa-store-a';

function gitArchiveMain() {
  const dir = join(tmpdir(), 'milksha-board-anim-main');
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

async function measureFakeCloudLatency(siteRoot) {
  const { spawn } = await import('node:child_process');
  const { installBundledCloudRouteShim, resetCloudState } = await import('../tests/e2e/harness.mjs');
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
  const times = [];
  try {
    await resetCloudState({ seedDevice: true });
    await board.goto(`http://127.0.0.1:${PORT}/?mode=cloud&store=${STORE}`);
    await ctrl.goto(`http://127.0.0.1:${PORT}/controller/?mode=cloud&store=${STORE}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    for (let i = 0; i < 10; i += 1) {
      const t0 = Date.now();
      await ctrl.click('[data-testid="btn-send-numbers"]');
      await board.waitForFunction(
        (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
        i + 1,
        { timeout: 3000 },
      );
      times.push(Date.now() - t0);
    }
  } finally {
    await ctx.close();
    await browser.close();
    cloud.kill('SIGTERM');
  }
  return { median: median(times), max: Math.max(...times), samples: times };
}

async function burstScreenshots(viewport, label) {
  const dir = join(ART, 'burst', label);
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/?mode=local`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload));
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
  });
  const frames = [];
  const capture = async () => {
    const i = frames.length;
    const p = join(dir, `frame-${String(i).padStart(4, '0')}.png`);
    await page.screenshot({ path: p });
    frames.push(p);
  };
  const interval = setInterval(capture, 50);
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '6101' }]);
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([
      { source_type: 'From_Store_Preparing', number: '6101' },
      { source_type: 'From_Store_OK', number: '6101' },
    ]);
  });
  await page.waitForTimeout(4000);
  clearInterval(interval);
  await capture();
  await ctx.close();
  await browser.close();
  return frames;
}

async function perfTrace(viewport, label) {
  const dir = join(ART, 'perf');
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const client = await ctx.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await ctx.tracing.start({ screenshots: true, snapshots: true, sources: false });
  await page.goto(`http://127.0.0.1:${PORT}/?mode=local`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload));
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
  });
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate((n) => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: String(6200 + n) },
        { source_type: 'From_Store_OK', number: String(6300 + n) },
      ]);
    }, i);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(800);
  const tracePath = join(dir, `trace-${label}-cpu4x.zip`);
  await ctx.tracing.stop({ path: tracePath });
  const longTasks = await page.evaluate(() => {
    return performance.getEntriesByType('measure').map((e) => ({ name: e.name, duration: e.duration }));
  });
  await browser.close();
  return { tracePath, longTasks };
}

async function liveCloudSends() {
  const { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } = await import(
    '../tests/e2e/board-animation-live-setup.mjs'
  );
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(180000);
  await installLiveBranchCloudRoutes(ctx);
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  const times = [];
  const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
  await board.goto(`${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=stb-01`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 180000 });
  await ctrlNav;
  await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
  for (let i = 0; i < 5; i += 1) {
    const t0 = Date.now();
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await board.waitForFunction(
      (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
      i + 1,
      { timeout: 3000 },
    );
    times.push(Date.now() - t0);
    if (i >= 2) {
      const skip = await board.evaluate(() => window.QMS.runtime.getAnimSkipReason?.() ?? '');
      if (skip === 'prefers-reduced-motion' || skip === 'no-web-animations-api') {
        continue;
      }
    }
  }
  await browser.close();
  return { samples: times, max: Math.max(...times), median: median(times) };
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const { startSite, ensureCloudRunning } = await import('../tests/e2e/harness.mjs');
  await ensureCloudRunning();
  await startSite();

  const { stopSite } = await import('../tests/e2e/harness.mjs');
  const branchLatency = await measureFakeCloudLatency(ROOT);
  const mainRoot = gitArchiveMain();
  process.env.MILKSHA_SITE_ROOT = mainRoot;
  stopSite();
  await startSite();
  const mainLatency = await measureFakeCloudLatency(mainRoot);
  delete process.env.MILKSHA_SITE_ROOT;
  stopSite();
  await startSite();

  const burst1080 = await burstScreenshots({ width: 1920, height: 1080 }, '1920x1080');
  const burst4k = await burstScreenshots({ width: 3840, height: 2160 }, '3840x2160');
  const perf1080 = await perfTrace({ width: 1920, height: 1080 }, '1920x1080');
  const perf4k = await perfTrace({ width: 3840, height: 2160 }, '3840x2160');

  let liveCloud = null;
  try {
    liveCloud = await liveCloudSends();
  } catch (err) {
    liveCloud = { error: String(err && err.message ? err.message : err) };
  }

  const head = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  const report = {
    head,
    branchLatency,
    mainLatency,
    burst1080Count: burst1080.length,
    burst4kCount: burst4k.length,
    perf1080,
    perf4k,
    liveCloud,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(ART, 'metrics.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
