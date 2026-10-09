#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-ready-fade-self-qa', 'screenshots');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);

async function captureHold(page, outPath) {
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
    const batch = [];
    for (let i = 0; i < 10; i += 1) {
      batch.push({ source_type: 'From_Store_OK', number: '777' + i });
    }
    window.QMS.runtime.applyPayload(batch);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([
      { source_type: 'From_Store_Preparing', number: '9999' },
      { source_type: 'From_Store_OK', number: '9999' },
    ]);
  });
  await page.waitForTimeout(450);
  await page.locator('.milksha-zone.ready').screenshot({ path: outPath });
}

async function main() {
  const { startSite } = await import('../tests/e2e/harness.mjs');
  await startSite();
  mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch();
  for (const vp of [{ width: 1920, height: 1080, tag: '1920x1080' }, { width: 3840, height: 2160, tag: '3840x2160' }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/?mode=local`);
    await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload));
    await captureHold(page, join(ART, `${vp.tag}-fullgrid-safe-scale.png`));

    const pageU = await ctx.newPage();
    await pageU.goto(`http://127.0.0.1:${PORT}/?mode=local&animScaleUnsafe=1&animScale=1.3`);
    await pageU.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload));
    await captureHold(pageU, join(ART, `${vp.tag}-fullgrid-unsafe-1.3.png`));
    await ctx.close();
  }
  await browser.close();
  console.log('wrote compare shots to', ART);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
