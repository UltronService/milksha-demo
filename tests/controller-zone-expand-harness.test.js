import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const harnessPath = join(dirname(fileURLToPath(import.meta.url)), 'e2e', 'harness.mjs');

test('controller zone expand helpers click toggles (no DOM mutation shortcuts)', function () {
  const src = readFileSync(harnessPath, 'utf8');
  assert.match(src, /zone-toggle-test-tools/);
  assert.match(src, /await toggle\.click\(\)/);
  assert.doesNotMatch(src, /body\.hidden = false/);
  assert.doesNotMatch(src, /setAttribute\('aria-expanded', 'true'\)/);
  assert.doesNotMatch(src, /getElementById\('btn-connect'\)\?\.click\(\)/);
});
