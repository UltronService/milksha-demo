#!/usr/bin/env node
/**
 * Repro: controller quick-send push_numbers for store a17 against live GitHub Pages + milksha-qms-dev.
 * Writes only to a17; ends with clear_now on a17.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CTRL_URL = 'https://ultronservice.github.io/milksha-demo/controller/?mode=cloud&store=a17&device=stb-01';
const ART = join(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts', 'a17-push-repro');

async function main() {
  mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const networkLog = [];

  page.on('requestfailed', (req) => {
    networkLog.push({
      kind: 'requestfailed',
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || '',
    });
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('cloudfunctions.net') && !url.includes('firestore.googleapis.com')) {
      return;
    }
    let body = '';
    try {
      body = await res.text();
    } catch {
      body = '';
    }
    networkLog.push({
      kind: 'response',
      url,
      status: res.status(),
      body: body.slice(0, 500),
    });
  });

  await page.goto(CTRL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    const section = document.getElementById('sec-connect');
    if (!section) return;
    const btn = section.querySelector('.zone-toggle');
    const body = section.querySelector('.zone-body');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    if (body) body.hidden = false;
  });
  await page.evaluate(() => {
    const section = document.getElementById('sec-connect');
    if (!section) return;
    const btn = section.querySelector('.zone-toggle');
    const body = section.querySelector('.zone-body');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    if (body) body.hidden = false;
  });
  await page.locator('#btn-connect').click();
  try {
    await page.waitForFunction(
      () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
      { timeout: 45000 },
    );
  } catch {
    const snap = await page.evaluate(() => ({
      online: document.getElementById('online-state')?.outerHTML,
      log: document.getElementById('log-list')?.textContent?.slice(0, 1500),
      banner: document.getElementById('user-banner')?.textContent,
    }));
    writeFileSync(join(ART, 'connect-fail.json'), JSON.stringify(snap, null, 2));
    throw new Error('connect failed; see connect-fail.json');
  }

  await page.locator('#fld-quick-no').fill('2001');
  await page.locator('#fld-quick-source').selectOption('store');
  await page.locator('#btn-send-numbers').click();
  await page.waitForTimeout(6000);

  const alertVisible = await page.locator('[data-testid="command-error-alert"]:not([hidden])').isVisible().catch(() => false);
  const alertMsg = alertVisible
    ? await page.locator('[data-testid="command-error-message"]').textContent()
    : '';
  const alertDetail = alertVisible
    ? await page.locator('[data-testid="command-error-detail"]').textContent()
    : '';
  const logText = await page.locator('#log-list').textContent().catch(() => '');
  const banner = await page.locator('#user-banner').textContent().catch(() => '');

  const report = {
    at: new Date().toISOString(),
    ctrlUrl: CTRL_URL,
    alertVisible,
    alertMsg,
    alertDetail,
    banner,
    logSnippet: (logText || '').slice(0, 2000),
    networkLog,
  };
  writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ alertVisible, alertMsg, alertDetail: alertDetail?.slice(0, 200) }, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
