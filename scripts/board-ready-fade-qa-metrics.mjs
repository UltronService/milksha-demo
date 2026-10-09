#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARD_PERF_INIT_SCRIPT, primeBoard, runPerfScenario } from './board-animation-perf-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-ready-fade-self-qa');

async function measureSafeScale(page) {
  await primeBoard(page);
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
    const batch = [];
    for (let i = 0; i < 10; i += 1) {
      batch.push({ source_type: 'From_Store_OK', number: '999' + i });
    }
    window.QMS.runtime.applyPayload(batch);
  });
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const layer = document.querySelector('.milksha-zone.ready .milksha-zone-numbers');
    return window.QMS.MilkshaBoardAnimConfig.getEffectiveReadyScale(layer);
  });
}

async function perfReadyPulse(viewport) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(BOARD_PERF_INIT_SCRIPT);
  const page = await ctx.newPage();
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await primeBoard(page);
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
  });
  const result = await runPerfScenario(page, 'ready-scale-pulse', async () => {
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '8888' }]);
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([
        { source_type: 'From_Store_Preparing', number: '8888' },
        { source_type: 'From_Store_OK', number: '8888' },
      ]);
    });
  }, 3800);
  const scale = await measureSafeScale(page);
  await browser.close();
  return { viewport: viewport, perf: result, scale: scale };
}

async function main() {
  const { startSite } = await import('../tests/e2e/harness.mjs');
  await startSite();
  mkdirSync(ART, { recursive: true });
  const p1080 = await perfReadyPulse({ width: 1920, height: 1080 });
  const p4k = await perfReadyPulse({ width: 3840, height: 2160 });
  const metricsPath = join(ART, 'metrics.json');
  const base = existsSync(metricsPath) ? JSON.parse(readFileSync(metricsPath, 'utf8')) : {};
  base.perfReadyPulseCpu4x = { '1920x1080': p1080, '3840x2160': p4k };
  base.generatedAt = new Date().toISOString();
  writeFileSync(metricsPath, JSON.stringify(base, null, 2));
  console.log(JSON.stringify(base.perfReadyPulseCpu4x, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
