import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertLivePreviewMatchesExpected,
  buildPreviewBaseUrl,
  loadExpectedPreviewAssetStamp,
  resolvePreviewPrNumber,
} from '../scripts/lib/board-pr-preview-deploy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('buildPreviewBaseUrl uses the resolved PR number in the path', function () {
  const url = buildPreviewBaseUrl(125);
  assert.equal(url, 'https://ultronservice.github.io/milksha-demo/pr-preview/pr-125/');
});

test('resolvePreviewPrNumber prefers commit-associated PR over stale fallback 123', function () {
  const num = resolvePreviewPrNumber({
    associatedPrNumbers: ['125'],
    headLookupNumber: '123',
    dispatchInput: '',
  });
  assert.equal(num, '125');
});

test('resolvePreviewPrNumber does not fall back to 123 when association is missing', function () {
  const num = resolvePreviewPrNumber({
    associatedPrNumbers: [],
    headLookupNumber: '',
    dispatchInput: '',
  });
  assert.equal(num, null);
});

test('loadExpectedPreviewAssetStamp reads version from config/asset-version.json', function () {
  const stamp = loadExpectedPreviewAssetStamp({
    assetVersionJsonText: JSON.stringify({ version: '20261026b' }),
    milkshaAssetVersionJsText: readFileSync(join(root, 'js/milksha-asset-version.js'), 'utf8').replace(
      '20261026a',
      '20261026b',
    ),
  });
  assert.equal(stamp.expectedVersion, '20261026b');
  assert.ok(stamp.expectedBuildLabel);
});

test('assertLivePreviewMatchesExpected rejects wrong live MILKSHA_ASSET_VERSION', function () {
  const expected = loadExpectedPreviewAssetStamp({
    assetVersionJsonText: JSON.stringify({ version: '20261026b' }),
    milkshaAssetVersionJsText: `root.MILKSHA_ASSET_VERSION = '20261026b';
root.MILKSHA_BOARD_WEB_BUILD_LABEL = '10/26 12:00';`,
  });
  const result = assertLivePreviewMatchesExpected(
    `root.MILKSHA_ASSET_VERSION = '20261026a';
root.MILKSHA_BOARD_WEB_BUILD_LABEL = '10/26 12:00';`,
    expected,
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('20261026b')));
});

test('deploy-board-pr-preview workflow must not hardcode pr-123 or 20261026a', function () {
  const yaml = readFileSync(join(root, '.github/workflows/deploy-board-pr-preview.yml'), 'utf8');
  assert.ok(!yaml.includes("default: '123'"), 'workflow_dispatch must not default preview to pr-123');
  assert.ok(!yaml.includes('20261026a'), 'workflow must not grep a fixed asset version');
  assert.ok(
    yaml.includes('verify-board-pr-preview-live.mjs'),
    'workflow must verify live preview via script reading repo version sources',
  );
  assert.ok(
    yaml.includes('/commits/${GITHUB_SHA}/pulls'),
    'workflow must resolve PR number from the deployed commit',
  );
});
