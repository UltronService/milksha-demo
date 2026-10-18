import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const specPath = join(dirname(fileURLToPath(import.meta.url)), 'e2e', 'controller-source-quick-send.spec.mjs');

test('quick-send e2e uses 5-hex uber sample (not 4-digit store format)', function () {
  const src = readFileSync(specPath, 'utf8');
  assert.match(src, /fld-quick-source.*uber[\s\S]*AB12C/);
  assert.doesNotMatch(src, /uber[\s\S]{0,200}'1234'/);
});
