#!/usr/bin/env node
/**
 * Probe board UI for simulated devLogin 403 codes (route only; store c030020 read-only URL).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'pr27-403-codes-probe');
const PUBLIC_BASE = process.env.MILKSHA_PAGES_BASE || 'https://ultronservice.github.io/milksha-demo';
const STORE = 'c030020';

mkdirSync(ART, { recursive: true });

function loadApiKey() {
  const text = readFileSync(
    process.env.MILKSHA_WEB_CONFIG ||
      '/home/ubuntu/.cursor/projects/workspace/uploads/milksha-web-config_d1a4.txt',
    'utf8',
  );
  for (const line of text.split('\n')) {
    const m = line.match(/^MILKSHA_FIREBASE_API_KEY=(.+)$/);
    if (m) {
      return m[1].trim();
    }
  }
  throw new Error('no api key');
}

async function probeCode(browser, code) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let devLoginPosts = 0;
  await page.route('**/devLogin', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    devLoginPosts += 1;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code, message: `simulated ${code}` }),
    });
  });
  page.on('request', (req) => {
    if (req.url().includes('devLogin') && req.method() === 'POST') {
      /* counted in route */
    }
  });
  const t0 = Date.now();
  await page.goto(`${PUBLIC_BASE}/?mode=cloud&store=${STORE}`, { waitUntil: 'domcontentloaded' });
  let pausedVisible = false;
  let pausedText = '';
  try {
    await page.waitForFunction(
      () => {
        const el = document.getElementById('milksha-cloud-paused');
        return el && !el.hidden;
      },
      undefined,
      { timeout: 45000 },
    );
    pausedVisible = true;
    pausedText = await page.locator('#milksha-cloud-paused').innerText();
  } catch {
    pausedVisible = false;
  }
  const atPause = devLoginPosts;
  await page.waitForTimeout(60000);
  const afterIdle = devLoginPosts;
  const diag = await page.evaluate(() => ({
    pausedVisible: Boolean(
      document.getElementById('milksha-cloud-paused') &&
        !document.getElementById('milksha-cloud-paused').hidden,
    ),
    pausedText: (document.getElementById('milksha-cloud-paused')?.textContent || '').trim(),
    offlineVisible: Boolean(
      document.getElementById('milksha-cloud-offline') &&
        !document.getElementById('milksha-cloud-offline').hidden,
    ),
  }));
  await ctx.close();
  return {
    code,
    storeUrl: STORE,
    mode: 'route_simulated_devLogin_403',
    pausedWithin45s: pausedVisible,
    pausedText: pausedText.trim(),
    devLoginAtPause: atPause,
    devLoginDuring60sIdle: afterIdle - atPause,
    pass:
      pausedVisible &&
      pausedText.trim() === '連線暫停' &&
      atPause >= 1 &&
      afterIdle - atPause <= 1,
    diag,
    ms: Date.now() - t0,
  };
}

async function main() {
  loadApiKey();
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  const codes = ['store_not_allowed', 'store_id_invalid', 'dev_store_registry_full'];
  const results = [];
  for (const code of codes) {
    results.push(await probeCode(browser, code));
  }
  await browser.close();
  const report = {
    generatedAt: new Date().toISOString(),
    publicBase: PUBLIC_BASE,
    backendNote: '2d49cf0 auto-register; probes use route only on existing c030020 board URL',
    results,
  };
  writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
