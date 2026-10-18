#!/usr/bin/env node
/**
 * PR #101 failure 1 repro — real cloud, zz-qa-store-a only.
 * Usage:
 *   node artifacts/pr101-diag/repro-board-online.mjs
 *   MILKSHA_SITE_ROOT=$PWD/artifacts/controller-no-poll/main-worktree node artifacts/pr101-diag/repro-board-online.mjs --label=main-2f9b2bf
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBoardOnlineRepro, PR101_STORE } from './pr101-diag-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const siteRoot = process.env.MILKSHA_SITE_ROOT || ROOT;
const label = process.argv.find((a) => a.startsWith('--label='))?.split('=')[1] || 'branch';

if (PR101_STORE !== 'zz-qa-store-a') {
  throw new Error('Refusing store other than zz-qa-store-a');
}

const outDir = join(ROOT, 'artifacts', 'pr101-diag', 'evidence');
const evidence = await runBoardOnlineRepro({
  siteRoot,
  outDir,
  label,
  waitBoardOnlineMs: Number(process.env.PR101_WAIT_BOARD_ONLINE_MS || 120000),
});

if (!evidence.passed) {
  console.error('[pr101-dbg] FAIL board-online indicator stayed offline', label);
  process.exit(1);
}
console.log('[pr101-dbg] PASS board-online', label);
