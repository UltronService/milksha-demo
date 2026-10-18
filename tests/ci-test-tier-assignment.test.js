import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  isSupportPath,
  listE2eSpecFiles,
  listNightlyAssignedFiles,
  listPrE2eSpecFiles,
  listPrUnitTestFiles,
  loadCiTierManifest,
} from '../scripts/lib/ci-tier-manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('every test file is assigned to exactly one of PR or nightly tiers', function () {
  const manifest = loadCiTierManifest();
  const prUnit = new Set(listPrUnitTestFiles());
  const prE2e = new Set(listPrE2eSpecFiles(manifest));
  const nightly = new Set(listNightlyAssignedFiles(manifest));

  const allCandidates = [
    ...listPrUnitTestFiles(),
    ...listE2eSpecFiles(),
    ...manifest.nightly.firestoreRules,
  ];

  for (const rel of allCandidates) {
    if (isSupportPath(rel, manifest)) {
      continue;
    }
    const inPr = prUnit.has(rel) || prE2e.has(rel);
    const inNight = nightly.has(rel);
    assert.equal(
      inPr && inNight,
      false,
      `${rel} must not be in both PR and nightly`,
    );
    assert.equal(
      inPr || inNight,
      true,
      `${rel} must be assigned to PR or nightly`,
    );
  }

  for (const rel of nightly) {
    assert.ok(!prE2e.has(rel), `nightly file ${rel} must not be in PR e2e`);
  }
});

test('PR e2e manifest excludes all live-cloud specs', function () {
  const manifest = loadCiTierManifest();
  const prE2e = listPrE2eSpecFiles(manifest);
  const live = listE2eSpecFiles().filter((p) => p.includes('-live-cloud.spec.mjs'));
  for (const spec of live) {
    assert.ok(!prE2e.includes(spec), `${spec} must not run on PR`);
  }
});

test('nightly live-cloud specs match manifest list', function () {
  const manifest = loadCiTierManifest();
  const live = listE2eSpecFiles().filter((p) => p.endsWith('-live-cloud.spec.mjs'));
  assert.deepEqual(live.sort(), [...manifest.nightly.e2eLiveCloud].sort());
});
