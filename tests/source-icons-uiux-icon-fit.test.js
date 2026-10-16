import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runIconFitCheck } from '../scripts/check-source-icons-uiux-icon-fit.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('UI/UX 64px preview icons: aspect preserved, within S×S, not clipped by icon box', async function () {
  const result = await runIconFitCheck();
  assert.equal(result.fontPx, 64);
  assert.equal(result.sPx, 64 * 0.8);
  assert.ok(result.icons.length > 0, 'expected at least one icon on preview board');
  assert.equal(
    result.ok,
    true,
    'icon fit failures:\n' + result.failures.join('\n'),
  );
});
