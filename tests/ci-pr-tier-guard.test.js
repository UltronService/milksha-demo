import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const harnessPath = join(dirname(fileURLToPath(import.meta.url)), 'e2e', 'harness.mjs');

test('harness installs PR-tier production network guard on new contexts', function () {
  const src = readFileSync(harnessPath, 'utf8');
  assert.ok(src.includes('MILKSHA_CI_TIER'), 'harness must reference MILKSHA_CI_TIER');
  assert.ok(src.includes('installPrTierNetworkGuard'), 'harness must define installPrTierNetworkGuard');
  assert.ok(
    src.includes('firestore.googleapis.com'),
    'guard must mention firestore.googleapis.com',
  );
  assert.match(src, /freshContext[\s\S]*installPrTierNetworkGuard/);
  assert.match(src, /isolatedCloudContext[\s\S]*installPrTierNetworkGuard/);
});

test('installBundledCloudRouteShim registers proxy routes before PR guard abort', function () {
  const src = readFileSync(harnessPath, 'utf8');
  const shimStart = src.indexOf('export async function installBundledCloudRouteShim');
  const shimBody = src.slice(shimStart, shimStart + 2500);
  assert.ok(shimBody.includes('installPrTierNetworkGuard'), 'shim must call guard helper');
  const guardIdx = shimBody.indexOf('installPrTierNetworkGuard');
  const routeIdx = shimBody.indexOf("page.route('https://firestore.googleapis.com");
  assert.ok(guardIdx >= 0 && routeIdx > guardIdx, 'proxy routes must follow guard setup');
});
