#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-ready-fade-self-qa');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);
const STORE = 'zz-qa-store-a';

function gitArchiveMain() {
  const dir = join(tmpdir(), 'milksha-ready-fade-main');
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  execSync(`git archive main | tar -x -C "${dir}"`, { cwd: ROOT, stdio: 'ignore' });
  return dir;
}

async function measureFirstSendTimeline(siteRoot, label) {
  const {
    installBundledCloudRouteShim,
    resetCloudState,
    startSite,
    stopSite,
  } = await import('../tests/e2e/harness.mjs');
  if (siteRoot !== ROOT) {
    process.env.MILKSHA_SITE_ROOT = siteRoot;
    stopSite();
    await startSite();
  } else {
    await startSite();
  }
  const cloudPort = Number(process.env.FAKE_CLOUD_PORT || 8787);
  const timeline = [];
  const t0 = Date.now();
  const cloud = spawn(process.execPath, [join(siteRoot, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(cloudPort) },
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 800));
  timeline.push({ phase: 'fake-cloud-listen-wait-800ms', ms: Date.now() - t0 });

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const board = await ctx.newPage();
  const ctrl = await ctx.newPage();
  await installBundledCloudRouteShim(board);
  await installBundledCloudRouteShim(ctrl);

  try {
    await resetCloudState({ seedDevice: true });
    timeline.push({ phase: 'resetCloudState-done', ms: Date.now() - t0 });

    await board.goto(`http://127.0.0.1:${PORT}/?mode=cloud&store=${STORE}`);
    timeline.push({ phase: 'board-goto-submitted', ms: Date.now() - t0 });
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    timeline.push({ phase: 'receiverCloud-true', ms: Date.now() - t0 });

    await ctrl.goto(`http://127.0.0.1:${PORT}/controller/?mode=cloud&store=${STORE}`);
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    timeline.push({ phase: 'controller-online', ms: Date.now() - t0 });

    const clickAt = Date.now();
    await ctrl.click('[data-testid="btn-send-numbers"]');
    timeline.push({ phase: 'send-click', ms: clickAt - t0 });

    await board.waitForFunction(
      (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
      1,
      { timeout: 15000 },
    );
    const visibleAt = Date.now();
    timeline.push({
      phase: 'ready-num-visible',
      ms: visibleAt - t0,
      clickToVisibleMs: visibleAt - clickAt,
    });

    const rcvTimeline = await board.evaluate(() => window.__rcvMatrixTimeline || []);
    timeline.push({ phase: 'board-rcv-timeline', events: rcvTimeline.slice(0, 12) });
  } finally {
    await ctx.close();
    await browser.close();
    cloud.kill('SIGTERM');
    if (siteRoot !== ROOT) {
      delete process.env.MILKSHA_SITE_ROOT;
      stopSite();
    }
  }

  return { label, siteRoot: siteRoot === ROOT ? 'branch' : 'main-archive', timeline };
}

async function runFiveFirstSamples(siteRoot, label) {
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    const row = await measureFirstSendTimeline(siteRoot, `${label}-run${i + 1}`);
    const vis = row.timeline.find((e) => e.phase === 'ready-num-visible');
    samples.push({
      run: i + 1,
      clickToVisibleMs: vis?.clickToVisibleMs ?? null,
      timeline: row.timeline,
    });
  }
  return { label, samples };
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const mainRoot = gitArchiveMain();
  const branchFive = await runFiveFirstSamples(ROOT, 'branch');
  const mainFive = await runFiveFirstSamples(mainRoot, 'main');
  const out = {
    generatedAt: new Date().toISOString(),
    store: STORE,
    firstSendFiveRuns: { branch: branchFive, main: mainFive },
    note: 'run1 timeline 含 fake-cloud 啟動、resetCloudState、receiverCloud、controller online、click→visible',
  };
  writeFileSync(join(ART, 'fake-cloud-first-send-timeline.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
