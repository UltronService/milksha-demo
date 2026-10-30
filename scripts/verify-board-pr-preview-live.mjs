#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assertLivePreviewMatchesExpected,
  loadExpectedPreviewAssetStamp,
} from './lib/board-pr-preview-deploy.mjs';

const repoRoot = process.argv[2];
const previewBase = process.argv[3];
const settleSeconds = Number(process.env.PREVIEW_VERIFY_SETTLE_SECONDS ?? '15');

if (!repoRoot || !previewBase) {
  console.error('Usage: verify-board-pr-preview-live.mjs <repo-root> <preview-base-url>');
  process.exit(2);
}

const expected = loadExpectedPreviewAssetStamp({
  assetVersionJsonText: readFileSync(join(repoRoot, 'config/asset-version.json'), 'utf8'),
  milkshaAssetVersionJsText: readFileSync(join(repoRoot, 'js/milksha-asset-version.js'), 'utf8'),
});

if (settleSeconds > 0) {
  spawnSync('sleep', [String(settleSeconds)], { stdio: 'inherit' });
}

const url = `${previewBase.replace(/\/?$/, '/')}js/milksha-asset-version.js`;
const curl = spawnSync('curl', ['-fsSL', '-L', '--max-time', '60', url], { encoding: 'utf8' });
if (curl.status !== 0) {
  console.error(`verify-board-pr-preview-live: curl failed for ${url}`);
  process.exit(1);
}

const verdict = assertLivePreviewMatchesExpected(curl.stdout, expected);
if (!verdict.ok) {
  for (const err of verdict.errors) {
    console.error(`verify-board-pr-preview-live: ${err}`);
  }
  process.exit(1);
}

console.log(
  `verify-board-pr-preview-live: ok version=${expected.expectedVersion} label=${expected.expectedBuildLabel ?? '(none)'}`,
);
