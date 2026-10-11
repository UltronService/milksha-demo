'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');

function loadLib() {
  return import(join(ROOT, 'scripts', 'asset-version-lib.mjs'));
}

test('HTML entry ?v= matches config/asset-version.json', async () => {
  const lib = await loadLib();
  const expected = lib.loadAssetVersion();
  /** @type {string[]} */
  const errors = [];
  for (const htmlPath of lib.HTML_ENTRY_POINTS) {
    const refs = lib.parseHtmlAssetRefs(htmlPath);
    for (const ref of refs) {
      if (ref.version === null) {
        errors.push(`${htmlPath}: ${ref.href} missing ?v=`);
        continue;
      }
      if (ref.version !== expected) {
        errors.push(`${htmlPath}: ${ref.href} has ?v=${ref.version}, want ${expected}`);
      }
    }
  }
  const legacy = join(ROOT, 'js', 'milksha-asset-version.js');
  const legacyText = readFileSync(legacy, 'utf8');
  const legacyMatch = legacyText.match(/MILKSHA_ASSET_VERSION\s*=\s*'([^']+)'/);
  if (!legacyMatch || legacyMatch[1] !== expected) {
    errors.push(`js/milksha-asset-version.js MILKSHA_ASSET_VERSION must be ${expected}`);
  }
  assert.equal(errors.length, 0, errors.join('\n'));
});

test('js/css changes vs origin/main require asset version bump', async () => {
  if (process.env.SKIP_ASSET_VERSION_GIT_CHECK === '1') {
    return;
  }
  const lib = await loadLib();
  const mergeBase = process.env.ASSET_VERSION_MERGE_BASE || 'origin/main';
  const changed = lib.gitChangedPathsSince(mergeBase);
  if (changed.length === 0) {
    return;
  }
  const assetChanges = changed.filter((p) => lib.isCacheBustedAssetPath(p));
  if (assetChanges.length === 0) {
    return;
  }
  const versionBumped = lib.assetVersionFileChangedSince(mergeBase);
  assert.ok(
    versionBumped,
    `These cache-busted assets changed since ${mergeBase} but config/asset-version.json did not:\n${assetChanges.join('\n')}\nBump config/asset-version.json and all HTML ?v= query params.`,
  );
});
