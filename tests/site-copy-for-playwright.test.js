import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  copySiteForPlaywright,
  removeSiteCopy,
  shouldSkipSiteCopyPath,
} from '../scripts/lib/copy-site-for-playwright.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('shouldSkipSiteCopyPath excludes node_modules and .git', function () {
  assert.equal(shouldSkipSiteCopyPath('/repo/node_modules/x'), true);
  assert.equal(shouldSkipSiteCopyPath('/repo/.git/config'), true);
  assert.equal(shouldSkipSiteCopyPath('/repo/.git'), true);
  assert.equal(shouldSkipSiteCopyPath('/repo/js/board/foo.js'), false);
});

test('copySiteForPlaywright uses unique directories and does not copy .git', async function () {
  const copies = await Promise.all([
    copySiteForPlaywright(root),
    copySiteForPlaywright(root),
    copySiteForPlaywright(root),
    copySiteForPlaywright(root),
    copySiteForPlaywright(root),
  ]);
  const roots = new Set(copies.map((c) => c.siteRoot));
  assert.equal(roots.size, copies.length, 'each copy must use a unique siteRoot');
  for (const copy of copies) {
    assert.ok(existsSync(join(copy.dest, 'js')), 'site copy must include js/');
    assert.equal(existsSync(join(copy.siteRoot, '.git')), false, 'site copy must not include .git');
    assert.equal(existsSync(join(copy.dest, '.git')), false);
    await removeSiteCopy(copy.siteRoot);
  }
});
