import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(rootDir, 'scripts', 'check-source-icons-mockup.mjs');

test('source-icons full-board mockup has no cell overlap or cream overflow', function () {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    cwd: rootDir,
  });
  assert.equal(
    result.status,
    0,
    (result.stderr || '') + (result.stdout || 'layout check failed'),
  );
});
