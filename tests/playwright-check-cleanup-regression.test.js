import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HANG_MS = 8000;
const MISSING_BROWSERS_PATH = join(root, '.playwright-missing-for-regression-test');

function runHarness(scriptRel) {
  const script = join(root, scriptRel);
  const started = Date.now();
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: MISSING_BROWSERS_PATH,
    },
    timeout: HANG_MS,
  });
  return { result, elapsedMs: Date.now() - started };
}

function assertHarnessExitsQuickly(label, scriptRel) {
  const { result, elapsedMs } = runHarness(scriptRel);
  assert.equal(
    result.signal,
    null,
    `${label}: process did not exit cleanly (signal=${result.signal}, elapsed=${elapsedMs}ms)`,
  );
  assert.ok(
    elapsedMs < HANG_MS - 500,
    `${label}: harness ran too long (${elapsedMs}ms)`,
  );
}

test('runCreamColumnBoundsCheck harness exits when chromium launch fails', function () {
  assertHarnessExitsQuickly(
    'column alignment',
    'tests/fixtures/playwright-launch-failure-column.harness.mjs',
  );
});

test('runOfficialBoardLayoutCheck harness exits when chromium launch fails', function () {
  assertHarnessExitsQuickly(
    'official layout',
    'tests/fixtures/playwright-launch-failure-official.harness.mjs',
  );
});
