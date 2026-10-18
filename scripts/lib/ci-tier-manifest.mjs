import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @returns {import('./ci-tier-manifest.types').CiTierManifest} */
export function loadCiTierManifest() {
  const raw = readFileSync(join(rootDir, 'tests', 'ci-test-tier-manifest.json'), 'utf8');
  return JSON.parse(raw);
}

export function listPrUnitTestFiles() {
  return readdirSync(join(rootDir, 'tests'))
    .filter((name) => name.endsWith('.test.js'))
    .map((name) => join('tests', name))
    .sort();
}

export function listE2eSpecFiles() {
  return readdirSync(join(rootDir, 'tests', 'e2e'))
    .filter((name) => name.endsWith('.spec.mjs'))
    .map((name) => join('tests', 'e2e', name))
    .sort();
}

export function listPrE2eSpecFiles(manifest) {
  const m = manifest || loadCiTierManifest();
  const suffix = m.pr.e2eExcludePattern.replace('*', '');
  return listE2eSpecFiles().filter((rel) => !rel.endsWith(suffix));
}

export function listNightlyAssignedFiles(manifest) {
  const m = manifest || loadCiTierManifest();
  return [...m.nightly.e2eLiveCloud, ...m.nightly.firestoreRules].sort();
}

export function isSupportPath(relPath, manifest) {
  const m = manifest || loadCiTierManifest();
  const normalized = relPath.replace(/\\/g, '/');
  return m.supportPaths.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}
