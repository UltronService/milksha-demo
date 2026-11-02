import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildDeployedPreviewsManifest,
  evaluatePreserveStep,
  listPrNumbersFromDeploySite,
  mergePreservePrNumbers,
  parseDeployedPreviewsManifest,
} from '../scripts/lib/pages-pr-preview-preserve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('mergePreservePrNumbers includes merged cursor PRs from gh list (not only open)', function () {
  const nums = mergePreservePrNumbers({
    fromManifest: [],
    fromGhCursorPrs: ['123', '120', '100', '47'],
    currentPr: '',
  });
  assert.deepEqual(nums, ['47', '100', '120', '123']);
});

test('mergePreservePrNumbers skips current PR being deployed from trial branch', function () {
  const nums = mergePreservePrNumbers({
    fromManifest: ['100', '120'],
    fromGhCursorPrs: ['123'],
    currentPr: '123',
  });
  assert.deepEqual(nums, ['100', '120']);
});

test('parseDeployedPreviewsManifest reads live Pages manifest', function () {
  const raw = buildDeployedPreviewsManifest(['123', '120', '100']);
  const parsed = parseDeployedPreviewsManifest(raw);
  assert.deepEqual(parsed, ['100', '120', '123']);
});

test('strict main deploy fails when live preview exists but mirror did not run', function () {
  const v = evaluatePreserveStep({
    strict: true,
    inManifest: false,
    httpCode: '200',
    mirrored: false,
    alreadyInArtifact: false,
    prNumber: '123',
  });
  assert.equal(v.action, 'fail');
});

test('strict main deploy fails when manifest requires folder but live is 404', function () {
  const v = evaluatePreserveStep({
    strict: true,
    inManifest: true,
    httpCode: '404',
    mirrored: false,
    alreadyInArtifact: false,
    prNumber: '120',
  });
  assert.equal(v.action, 'fail');
});

test('strict main deploy fails when mirrored folder lacks index-referenced assets', function () {
  const v = evaluatePreserveStep({
    strict: true,
    inManifest: true,
    httpCode: '200',
    mirrored: true,
    alreadyInArtifact: false,
    prNumber: '124',
    integrityOk: false,
  });
  assert.equal(v.action, 'fail');
});

test('non-strict deploy may skip 404 previews not listed in manifest', function () {
  const v = evaluatePreserveStep({
    strict: false,
    inManifest: false,
    httpCode: '404',
    mirrored: false,
    alreadyInArtifact: false,
    prNumber: '47',
  });
  assert.equal(v.action, 'skip');
});

test('deploy-pages workflow enables strict preserve and uses node preserve script', function () {
  const yaml = readFileSync(join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  assert.ok(yaml.includes('PAGES_PRESERVE_STRICT: "1"'), 'main deploy must set strict preserve');
  assert.ok(
    yaml.includes('preserve-pages-pr-preview.mjs'),
    'main deploy must run preserve-pages-pr-preview.mjs',
  );
  assert.ok(
    !yaml.includes('gh pr list --state open'),
    'deploy-pages must not preserve only open PRs via inline gh',
  );
});

test('listPrNumbersFromDeploySite collects pr-* directories for manifest', function () {
  assert.deepEqual(
    listPrNumbersFromDeploySite(['pr-100', 'pr-120', '_deployed-previews.json', 'pr-9']),
    ['9', '100', '120'],
  );
});
