#!/usr/bin/env node
/**
 * PR #101 failure 2a — 整個瀏覽器斷網 30s（真雲端 zz-qa-store-a）。
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDisconnectBannerRepro, PR101_STORE } from './pr101-diag-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const siteRoot = process.env.MILKSHA_SITE_ROOT || ROOT;
const label = process.argv.find((a) => a.startsWith('--label='))?.split('=')[1] || 'branch';

if (PR101_STORE !== 'zz-qa-store-a') {
  throw new Error('Refusing store other than zz-qa-store-a');
}

const outDir = join(ROOT, 'artifacts', 'pr101-diag', 'evidence');
const evidence = await runDisconnectBannerRepro({
  siteRoot,
  outDir,
  label,
  scenario: 'browser-offline-30s',
});

if (!evidence.passed) {
  console.error('[pr101-dbg] FAIL disconnect banner (browser offline 30s)', label);
  process.exit(1);
}
console.log('[pr101-dbg] PASS disconnect banner (browser offline 30s)', label);
