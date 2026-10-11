#!/usr/bin/env node
/**
 * Offline RED attempt: replay minimal page-turn + mid-send using local board + fake-cloud burst applies.
 * Fails (exit 1) on cross-zone; exit 0 if fake-cloud cannot reproduce (documented gap).
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { ensureCloudRunning, resetCloudState, startSite, installBundledCloudRouteShim } from '../../tests/e2e/harness.mjs';
import { primeBoardForAnimation } from '../../tests/e2e/board-animation-helpers.mjs';
import { readCrossZoneViolations } from './cross-zone-assert.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = join(dirname(fileURLToPath(import.meta.url)));

function toPayload(prepNos, readyNos) {
  const rows = [];
  for (const n of readyNos) {
    rows.push({ source_type: 'From_Store_OK', number: String(n) });
  }
  for (const n of prepNos) {
    rows.push({ source_type: 'From_Store_Preparing', number: String(n) });
  }
  return rows;
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const evidencePath = join(ROOT, 'artifacts/pr53-live/real-cloud-4146812-1080.json');
  let burstCount = 3;
  try {
    const ev = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const r0 = ev.roundSummaries?.[0];
    if (r0?.applyPayloadCount) {
      burstCount = r0.applyPayloadCount;
    }
  } catch {
    /* default */
  }

  process.env.MILKSHA_SITE_ROOT = ROOT;
  await ensureCloudRunning();
  await resetCloudState({ seedDevice: true });
  await startSite();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installBundledCloudRouteShim(page);
  await primeBoardForAnimation(page);

  const prep = [];
  const ready = [];
  for (let i = 0; i < 12; i += 1) {
    prep.push(String(7100 + i));
  }
  for (let i = 0; i < 12; i += 1) {
    ready.push(String(8100 + i));
  }
  await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows, { silent: false }), toPayload(prep, ready));
  await page.waitForTimeout(5200);
  prep.push('7200');
  const withMid = toPayload(prep, ready);
  for (let b = 0; b < burstCount; b += 1) {
    await page.evaluate(
      ({ rows, silent }) => window.QMS.runtime.applyPayload(rows, { silent }),
      { rows: withMid, silent: b > 0 },
    );
    await page.waitForTimeout(30);
  }
  const violations = [];
  for (let t = 0; t < 6500; t += 50) {
    await page.waitForTimeout(50);
    const v = await readCrossZoneViolations(page);
    if (!v.ok && v.violations?.length) {
      violations.push(...v.violations.map((x) => ({ tMs: t, ...x })));
    }
  }
  await browser.close();

  const out = { burstCount, violationEvents: violations.length, violations: violations.slice(0, 20), red: violations.length > 0 };
  writeFileSync(join(ART, 'offline-replay-red-result.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(violations.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
