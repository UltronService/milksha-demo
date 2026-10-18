import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCiTierManifest } from '../scripts/lib/ci-tier-manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readWorkflow(relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

test('PR workflow has no live-cloud job or LIVE_CLOUD_STORE_ID', function () {
  const manifest = loadCiTierManifest();
  const yaml = readWorkflow(manifest.pr.workflowFile);
  assert.ok(!yaml.includes('e2e-live-cloud:'), 'ci.yml must not define e2e-live-cloud job');
  assert.ok(!yaml.includes('LIVE_CLOUD_STORE_ID'), 'ci.yml must not set LIVE_CLOUD_STORE_ID');
  for (const spec of manifest.nightly.e2eLiveCloud) {
    const base = spec.split('/').pop();
    assert.ok(!yaml.includes(base), `ci.yml must not run ${base}`);
  }
});

test('PR workflow sets MILKSHA_CI_TIER and shards e2e', function () {
  const manifest = loadCiTierManifest();
  const yaml = readWorkflow(manifest.pr.workflowFile);
  assert.ok(yaml.includes('MILKSHA_CI_TIER'), 'ci.yml must set MILKSHA_CI_TIER for e2e');
  assert.ok(yaml.includes('--shard='), 'ci.yml must shard Playwright e2e');
  assert.ok(
    yaml.includes(`/${manifest.e2eShardCount}`),
    `ci.yml must use ${manifest.e2eShardCount} shards`,
  );
});

test('PR workflow caches Playwright browsers and uses 15 minute job timeout', function () {
  const manifest = loadCiTierManifest();
  const yaml = readWorkflow(manifest.pr.workflowFile);
  assert.ok(yaml.includes('ms-playwright'), 'ci.yml must cache Playwright browsers');
  const timeoutMatches = yaml.match(/timeout-minutes:\s*(\d+)/g) || [];
  assert.ok(timeoutMatches.length > 0, 'ci.yml must set timeout-minutes');
  for (const line of timeoutMatches) {
    const minutes = Number(line.replace(/[^\d]/g, ''));
    assert.equal(minutes, manifest.pr.jobTimeoutMinutes, 'each job timeout must be 15 minutes');
  }
});

test('PR workflow installs Playwright before npm test', function () {
  const yaml = readWorkflow('.github/workflows/ci.yml');
  const installIdx = yaml.indexOf('playwright install');
  const testIdx = yaml.indexOf('npm test');
  assert.ok(installIdx >= 0 && testIdx >= 0, 'ci.yml must run playwright install and npm test');
  assert.ok(installIdx < testIdx, 'playwright install must precede npm test');
});

test('nightly workflow runs live cloud only on zz-qa-ci-store', function () {
  const manifest = loadCiTierManifest();
  const yaml = readWorkflow(manifest.nightly.workflowFile);
  assert.ok(yaml.includes("cron: '0 20 * * *'") || yaml.includes('0 20 * * *'), 'nightly cron');
  assert.ok(yaml.includes('workflow_dispatch'), 'nightly must allow manual dispatch');
  assert.ok(yaml.includes(`LIVE_CLOUD_STORE_ID: ${manifest.nightly.liveCloudStoreId}`));
  for (const spec of manifest.nightly.e2eLiveCloud) {
    const base = spec.split('/').pop();
    assert.ok(yaml.includes(base), `nightly must run ${base}`);
  }
});
