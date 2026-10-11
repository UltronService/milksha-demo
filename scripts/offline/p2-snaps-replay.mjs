#!/usr/bin/env node
/** Offline replay: tests/fixtures/p2-snaps-compact.json → applyPayload (no cloud). Exit 2 if any ready >3s. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startSite } from '../../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'p2-snaps-compact.json');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);
const VW = Number(process.env.VW || 1920);
const VH = Number(process.env.VH || 1080);
const SCALE = Number(process.env.P2_REPLAY_SCALE || 1);

function isReady(n) {
  return n.startsWith('41') || n === '3112';
}

function toPayload(nos) {
  return nos.map((n) => ({
    source_type: isReady(n) ? 'From_Store_OK' : 'From_Store_Preparing',
    number: n,
  }));
}

await startSite();
const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
await page.goto(`http://127.0.0.1:${PORT}/?mode=local`);
await page.waitForFunction(() => window.QMS?.runtime?.applyPayload);
await page.evaluate(() => {
  window.QMS.runtime.applyPayload([], { silent: true });
  window.QMS.runtime.applyPayload([], { silent: true });
});
let prev = [];
const t0 = Date.now();
const res = [];
for (let i = 0; i < raw.length; i += 1) {
  const [ms, nos] = raw[i];
  const target = t0 + ms * SCALE;
  const wait = Math.max(0, target - Date.now());
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  await page.evaluate((nc) => window.QMS.runtime.applyPayload(nc, { silent: false }), toPayload(nos));
  const added = nos.filter((n) => !prev.includes(n) && n.startsWith('41'));
  for (const n of added) {
    const ta = Date.now();
    let msVis = null;
    while (Date.now() - ta < 15000) {
      if (
        await page.evaluate(
          (num) =>
            [...document.querySelectorAll('.milksha-ready .milksha-num')].some(
              (e) => e.textContent.trim() === num,
            ),
          n,
        )
      ) {
        msVis = Date.now() - ta;
        break;
      }
      await new Promise((r) => setTimeout(r, 15));
    }
    res.push({ n, ms: msVis });
  }
  prev = nos;
}
writeFileSync(join(ROOT, 'artifacts', 'page-turn-desync', `replay-${VW}x${VH}.json`), JSON.stringify(res));
const bad = res.filter((r) => r.ms === null || r.ms > 3000);
console.log(JSON.stringify({ VW, VH, bad: bad.length, sample: bad.slice(0, 5) }));
await browser.close();
process.exit(bad.length ? 2 : 0);
