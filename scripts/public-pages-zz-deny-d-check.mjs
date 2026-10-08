#!/usr/bin/env node
/** Quick live check d: board zz-deny-test → 連線暫停 + devLogin idle. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'pr27-zz-deny-d');
const PUBLIC_BASE = process.env.MILKSHA_PAGES_BASE || 'https://ultronservice.github.io/milksha-demo';
const STORE_DENY = 'zz-deny-test';

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

async function main() {
  loadApiKey();
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let devLoginPosts = 0;
  let last403 = null;
  page.on('response', async (res) => {
    if (!res.url().includes('devLogin') || res.request().method() !== 'POST') {
      return;
    }
    const body = res.request().postData() || '';
    if (!body.includes(STORE_DENY)) {
      return;
    }
    devLoginPosts += 1;
    if (res.status() === 403) {
      try {
        last403 = await res.json();
      } catch {
        last403 = { code: 'parse_error' };
      }
    }
  });
  await page.goto(`${PUBLIC_BASE}/?mode=cloud&store=${STORE_DENY}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const el = document.getElementById('milksha-cloud-paused');
      return el && !el.hidden;
    },
    undefined,
    { timeout: 90000 },
  );
  const pausedText = (await page.locator('#milksha-cloud-paused').innerText()).trim();
  const atPause = devLoginPosts;
  await page.waitForTimeout(15000);
  const report = {
    generatedAt: new Date().toISOString(),
    backendDeploy: '9940daf',
    url: `${PUBLIC_BASE}/?mode=cloud&store=${STORE_DENY}`,
    pausedText,
    devLoginAtPause: atPause,
    devLoginDuring15sIdle: devLoginPosts - atPause,
    devLogin403Body: last403,
    pass:
      pausedText === '連線暫停' &&
      atPause >= 1 &&
      devLoginPosts - atPause === 0 &&
      last403?.code === 'store_not_allowed',
  };
  writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.pass) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
