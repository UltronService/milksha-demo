#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { BOARD_PERF_INIT_SCRIPT, primeBoard, runPerfScenario } from './board-animation-perf-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-animation-self-qa');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);

function gitArchiveMain() {
  const dir = join(tmpdir(), 'milksha-board-anim-main-perf');
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  execSync('git archive main | tar -x -C "' + dir + '"', { cwd: ROOT, stdio: 'ignore' });
  return dir;
}

async function withCpuThrottle(page, rate) {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: rate });
}

async function measureScenarios(viewport, label) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(BOARD_PERF_INIT_SCRIPT);
  const page = await ctx.newPage();
  await withCpuThrottle(page, 4);
  await primeBoard(page);

  const out = {};

  out['1-new-prep'] = await runPerfScenario(page, '1-new-prep', async () => {
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '7101' }]);
    });
  });

  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '7101' }]);
  });
  await page.waitForTimeout(400);

  out['2-call-ready'] = await runPerfScenario(page, '2-call-ready', async () => {
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '7101' },
        { source_type: 'From_Store_OK', number: '7101' },
      ]);
    });
  });

  await page.waitForTimeout(400);
  out['3-pickup'] = await runPerfScenario(page, '3-pickup', async () => {
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([]);
    });
  });

  await page.waitForTimeout(400);
  const batch = [];
  for (let i = 1; i <= 11; i += 1) {
    batch.push({ source_type: 'From_Store_Preparing', number: String(7200 + i) });
  }
  await page.evaluate((payload) => {
    window.QMS.runtime.applyPayload(payload);
  }, batch);
  await page.waitForTimeout(400);

  out['4-page-turn'] = await runPerfScenario(page, '4-page-turn', async () => {
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
  });

  await page.evaluate((payload) => {
    window.QMS.runtime.applyPayload(payload);
  }, batch);
  await page.waitForTimeout(300);
  out['5-clear'] = await runPerfScenario(page, '5-clear', async () => {
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([]);
    });
  });

  await page.waitForTimeout(400);
  out['6-rapid-5'] = await runPerfScenario(page, '6-rapid-5', async () => {
    for (let i = 0; i < 5; i += 1) {
      await page.evaluate((n) => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: String(7300 + n) },
          { source_type: 'From_Store_OK', number: String(7400 + n) },
        ]);
      }, i);
    }
  }, 900);

  await browser.close();
  return { label: label, viewport: viewport, scenarios: out };
}

export async function collectPerfMetrics() {
  const { startSite } = await import('../tests/e2e/harness.mjs');
  await startSite();
  const branch1080 = await measureScenarios({ width: 1920, height: 1080 }, '1920x1080');
  const branch4k = await measureScenarios({ width: 3840, height: 2160 }, '3840x2160');

  let mainBlock = null;
  if (process.env.PERF_SKIP_MAIN !== '1') {
    const mainRoot = gitArchiveMain();
    process.env.MILKSHA_SITE_ROOT = mainRoot;
    const { stopSite } = await import('../tests/e2e/harness.mjs');
    stopSite();
    await startSite();
    const main1080 = await measureScenarios({ width: 1920, height: 1080 }, '1920x1080-main');
    const main4k = await measureScenarios({ width: 3840, height: 2160 }, '3840x2160-main');
    mainBlock = { '1920x1080': main1080.scenarios, '3840x2160': main4k.scenarios };
    delete process.env.MILKSHA_SITE_ROOT;
    stopSite();
    await startSite();
  }

  return {
    branch: { '1920x1080': branch1080.scenarios, '3840x2160': branch4k.scenarios },
    main: mainBlock,
    cpuThrottleRate: 4,
    note: 'CDP Emulation.setCPUThrottlingRate=4; rAF frame deltas + PerformanceObserver longtask during ~650–900ms window per scenario.',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(ART, { recursive: true });
  collectPerfMetrics()
    .then((perf) => {
      const path = join(ART, 'perf-metrics-partial.json');
      writeFileSync(path, JSON.stringify(perf, null, 2));
      console.log('wrote', path);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
