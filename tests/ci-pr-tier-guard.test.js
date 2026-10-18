import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const harnessPath = join(dirname(fileURLToPath(import.meta.url)), 'e2e', 'harness.mjs');

test('harness defines PR-tier production network guard for fake-cloud shim', function () {
  const src = readFileSync(harnessPath, 'utf8');
  assert.ok(src.includes('MILKSHA_CI_TIER'), 'harness must reference MILKSHA_CI_TIER');
  assert.ok(src.includes('installPrTierNetworkGuard'), 'harness must define installPrTierNetworkGuard');
  assert.ok(
    src.includes('firestore.googleapis.com'),
    'guard must mention firestore.googleapis.com',
  );
});

test('installBundledCloudRouteShim proxies production cloud hosts to fake-cloud', function () {
  const src = readFileSync(harnessPath, 'utf8');
  const shimStart = src.indexOf('export async function installBundledCloudRouteShim');
  const shimBody = src.slice(shimStart, shimStart + 2500);
  assert.ok(shimBody.includes("page.route('https://firestore.googleapis.com"));
  assert.ok(shimBody.includes('asia-east1-milksha-qms-dev.cloudfunctions.net'));
});
