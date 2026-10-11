#!/usr/bin/env node
/**
 * RED repro: fake-cloud QA page-turn loop on current MILKSHA_SITE_ROOT (default workspace).
 * Exits 1 when ready zone settled set mismatch events > 0 (QA parity symptom).
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCloudRunning, resetCloudState, startSite } from '../../tests/e2e/harness.mjs';
import { boardUrls, pageTurnDesync } from './qa-harness-core.mjs';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function main() {
  process.env.MILKSHA_SITE_ROOT = process.env.MILKSHA_SITE_ROOT || ROOT;
  await ensureCloudRunning();
  await resetCloudState({ seedDevice: true });
  await startSite();
  const urls = boardUrls();
  const browser = await chromium.launch({ headless: true });
  const r1080 = await pageTurnDesync(browser, { w: 1920, h: 1080, tag: '1080' }, urls, { scoring: 'qa-set' });
  await browser.close();
  const crossZone = (r1080.pageMismatchSamples || []).filter(
    (s) => s.zone === 'ready' && s.visible.some((n) => n.startsWith('7')),
  );
  const fail = r1080.pageMismatchEvents > 0 || r1080.missingOver3sCount > 0;
  console.log(
    JSON.stringify(
      {
        red: fail,
        pageMismatchEvents: r1080.pageMismatchEvents,
        missingOver3sCount: r1080.missingOver3sCount,
        crossZonePrepInReadySamples: crossZone,
        samples: r1080.pageMismatchSamples,
      },
      null,
      2,
    ),
  );
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
